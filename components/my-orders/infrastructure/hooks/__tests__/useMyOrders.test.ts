import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  fetchMyRegisteredDeliveryOrderItems,
  fetchMyRegisteredDeliveryOrders,
  fetchPendingDeliveryOrders,
  RegisteredDeliveryOrder,
} from '../../services/myOrdersService';
import { useMyOrders } from '../useMyOrders';

jest.mock('../../services/myOrdersService', () => ({
  fetchPendingDeliveryOrders: jest.fn(),
  fetchMyRegisteredDeliveryOrders: jest.fn(),
  fetchMyRegisteredDeliveryOrderItems: jest.fn(),
}));

const mockedPending = fetchPendingDeliveryOrders as jest.MockedFunction<typeof fetchPendingDeliveryOrders>;
const mockedHistory = fetchMyRegisteredDeliveryOrders as jest.MockedFunction<typeof fetchMyRegisteredDeliveryOrders>;
const mockedDetail = fetchMyRegisteredDeliveryOrderItems as jest.MockedFunction<typeof fetchMyRegisteredDeliveryOrderItems>;

function historyOrder(id: string): RegisteredDeliveryOrder {
  return {
    id,
    order_number: `OE-${id}`,
    order_type: 'customer',
    status: 'delivered',
    customer_id: 'customer-1',
    customer_name: 'Cliente',
    customer_id_number: '1',
    recipient_name: 'Cliente',
    recipient_type: 'customer',
    delivery_address: 'Calle 1',
    created_at: '2026-08-20T10:00:00Z',
    last_exit_at: '2026-08-21T10:00:00Z',
    total_items: 1,
    total_quantity: 2,
    delivered_quantity: 2,
    pending_quantity: 0,
    my_active_exit_count: 1,
    my_cancelled_exit_count: 0,
    my_active_quantity: 2,
    my_cancelled_quantity: 0,
    total_count: 2,
  };
}

describe('useMyOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPending.mockResolvedValue([]);
    mockedDetail.mockResolvedValue([]);
  });

  it('agrega la página siguiente sin reemplazar ni duplicar órdenes', async () => {
    mockedHistory
      .mockResolvedValueOnce({ orders: [historyOrder('1')], totalCount: 2, hasMore: true })
      .mockResolvedValueOnce({ orders: [historyOrder('1'), historyOrder('2')], totalCount: 2, hasMore: false });
    const { result } = renderHook(() => useMyOrders());

    await act(async () => { await result.current.refreshAll(); });
    await act(async () => { result.current.loadMoreHistory(); });

    await waitFor(() => expect(result.current.historyOrders.map((order) => order.id)).toEqual(['1', '2']));
    expect(mockedHistory).toHaveBeenLastCalledWith({ searchTerm: '', page: 2, pageSize: 20 });
  });

  it('mantiene el detalle en caché al cerrar y volver a abrir una orden', async () => {
    mockedHistory.mockResolvedValue({ orders: [historyOrder('1')], totalCount: 1, hasMore: false });
    mockedDetail.mockResolvedValue([{
      exit_id: 'exit-1',
      product_id: 'product-1',
      product_name: 'Producto',
      product_sku: null,
      product_barcode: null,
      warehouse_id: 'warehouse-1',
      warehouse_name: 'Principal',
      quantity: 1,
      created_at: '2026-08-21T10:00:00Z',
      delivery_observations: null,
      is_cancelled: false,
      cancellation_observations: null,
    }]);
    const { result } = renderHook(() => useMyOrders());

    await act(async () => { await result.current.refreshAll(); });
    await act(async () => { result.current.toggleHistoryOrder('1'); });
    await waitFor(() => expect(result.current.detailsByOrderId['1']?.items).toHaveLength(1));
    act(() => result.current.toggleHistoryOrder('1'));
    act(() => result.current.toggleHistoryOrder('1'));

    expect(mockedDetail).toHaveBeenCalledTimes(1);
    expect(result.current.expandedOrderId).toBe('1');
  });

  it('descarta una respuesta anterior cuando cambia la búsqueda', async () => {
    jest.useFakeTimers();
    let finishOldRequest: ((value: { orders: RegisteredDeliveryOrder[]; totalCount: number; hasMore: boolean }) => void) | undefined;
    mockedHistory
      .mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }))
      .mockResolvedValueOnce({ orders: [historyOrder('new')], totalCount: 1, hasMore: false });
    const { result } = renderHook(() => useMyOrders());

    let refreshPromise: Promise<void> | undefined;
    act(() => { refreshPromise = result.current.refreshAll(); });
    act(() => result.current.setHistorySearch('nuevo'));
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.historyOrders.map((order) => order.id)).toEqual(['new']));

    await act(async () => {
      finishOldRequest?.({ orders: [historyOrder('old')], totalCount: 1, hasMore: false });
      await refreshPromise;
    });

    expect(result.current.historyOrders.map((order) => order.id)).toEqual(['new']);
    jest.useRealTimers();
  });
});
