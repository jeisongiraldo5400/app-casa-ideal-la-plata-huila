import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchExitSerialsByExitId } from '@/components/exit-serials/infrastructure/services/exitSerialsService';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  fetchMyRegisteredDeliveryOrderItems,
  fetchMyRegisteredDeliveryOrders,
  fetchPendingDeliveryOrders,
  PendingDeliveryOrder,
} from '../../services/myOrdersService';
import { MY_ORDERS_DETAIL_OFFLINE_MESSAGE, useMyOrders } from '../useMyOrders';

/**
 * «Mis órdenes» sin señal: antes la pestaña de pendientes y la de entregas
 * mostraban el error de red. Ahora pendientes muestra la última lista que
 * llegó con señal (guardada en el teléfono) y entregas avisa sin error.
 */

// AsyncStorage de verdad (en memoria): el mock global no guarda nada.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => store.get(key) ?? null,
      setItem: async (key: string, value: string) => { store.set(key, value); },
      removeItem: async (key: string) => { store.delete(key); },
      clear: async () => { store.clear(); },
      getAllKeys: async () => [...store.keys()],
    },
  };
});

jest.mock('../../services/myOrdersService', () => ({
  fetchPendingDeliveryOrders: jest.fn(),
  fetchMyRegisteredDeliveryOrders: jest.fn(),
  fetchMyRegisteredDeliveryOrderItems: jest.fn(),
}));

jest.mock('@/components/exit-serials/infrastructure/services/exitSerialsService', () => ({
  fetchExitSerialsByExitId: jest.fn(async () => ({})),
}));

const NETWORK_ERROR = new Error('TypeError: Network request failed');
const mockedPending = fetchPendingDeliveryOrders as jest.Mock;
const mockedHistory = fetchMyRegisteredDeliveryOrders as jest.Mock;
const mockedDetail = fetchMyRegisteredDeliveryOrderItems as jest.Mock;

function pendingOrder(id: string): PendingDeliveryOrder {
  return {
    id,
    order_number: `REM-${id}`,
    order_type: 'remission',
    status: 'approved',
    customer_id: '',
    customer_name: 'Jhojan',
    customer_id_number: '',
    assigned_to_user_id: 'user-1',
    delivery_address: 'Bodega',
    notes: '',
    created_at: '2026-10-20T10:00:00Z',
    total_items: 2,
    total_quantity: 4,
    delivered_quantity: 1,
    pending_quantity: 3,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  (fetchExitSerialsByExitId as jest.Mock).mockResolvedValue({});
  await AsyncStorage.clear();
  useSyncStore.setState({ online: true, userId: 'user-1' });
  mockedHistory.mockResolvedValue({ orders: [], totalCount: 0, hasMore: false });
});

describe('useMyOrders · sin señal', () => {
  it('pendientes: si la red falla, muestra la última lista guardada sin error', async () => {
    mockedPending.mockResolvedValueOnce([pendingOrder('1')]);
    const first = renderHook(() => useMyOrders());
    await act(async () => { await first.result.current.refreshAll(); });
    expect(first.result.current.pendingOrders.map((order) => order.id)).toEqual(['1']);
    // La copia se guarda en segundo plano.
    await waitFor(async () => expect((await AsyncStorage.getAllKeys()).length).toBe(1));
    first.unmount();

    // Ya sin señal (la app se cerró y se volvió a abrir en el campo).
    mockedPending.mockRejectedValue(NETWORK_ERROR);
    const { result } = renderHook(() => useMyOrders());
    await act(async () => { await result.current.refreshAll(); });

    await waitFor(() => expect(result.current.pendingOrders.map((order) => order.id)).toEqual(['1']));
    expect(result.current.pendingError).toBeNull();
    expect(result.current.pendingSavedAt).toBeGreaterThan(0);
  });

  it('pendientes: la lista guardada es de esa persona, no de otra que usó el teléfono', async () => {
    mockedPending.mockResolvedValueOnce([pendingOrder('1')]);
    const first = renderHook(() => useMyOrders());
    await act(async () => { await first.result.current.refreshAll(); });
    await waitFor(async () => expect((await AsyncStorage.getAllKeys()).length).toBe(1));
    first.unmount();

    useSyncStore.setState({ online: false, userId: 'user-2' });
    const { result } = renderHook(() => useMyOrders());
    await act(async () => { await result.current.refreshAll(); });

    expect(result.current.pendingOrders).toEqual([]);
    expect(result.current.pendingError).toBeNull();
    expect(result.current.pendingSavedAt).toBe(0);
  });

  it('entregas: sin señal no es un error, y el detalle avisa que se consulta con conexión', async () => {
    useSyncStore.setState({ online: false });
    mockedPending.mockRejectedValue(NETWORK_ERROR);
    mockedHistory.mockRejectedValue(NETWORK_ERROR);
    mockedDetail.mockRejectedValue(NETWORK_ERROR);
    const { result } = renderHook(() => useMyOrders());
    await act(async () => { await result.current.refreshAll(); });

    expect(result.current.historyError).toBeNull();
    expect(result.current.historyOffline).toBe(true);
    expect(mockedHistory).not.toHaveBeenCalled();

    await act(async () => { result.current.toggleHistoryOrder('x'); });
    await waitFor(() => expect(result.current.detailsByOrderId.x?.error).toBe(MY_ORDERS_DETAIL_OFFLINE_MESSAGE));
  });

  it('con señal, un error que no es de red se sigue mostrando', async () => {
    mockedPending.mockRejectedValue(new Error('permission denied'));
    const { result } = renderHook(() => useMyOrders());
    await act(async () => { await result.current.refreshAll(); });
    expect(result.current.pendingError).toBeTruthy();
    expect(result.current.pendingSavedAt).toBeNull();
  });
});
