import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  DASHBOARD_REFRESH_MS,
  buildDashboardStats,
  useDashboardStats,
  type DashboardStatsOptions,
} from '@/hooks/useDashboardStats';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockedRpc = supabase.rpc as jest.Mock;
const NETWORK_ERROR = { message: 'TypeError: Network request failed', code: '' };

function ok(row: Record<string, unknown>) {
  return { data: [row], error: null };
}

describe('buildDashboardStats', () => {
  it('con error de red no devuelve 0: devuelve null para que el inicio pinte «—»', () => {
    const stats = buildDashboardStats({ data: null, error: NETWORK_ERROR }, { data: null, error: NETWORK_ERROR });

    expect(stats.pendingOrders).toBeNull();
    expect(stats.pendingDeliveryOrders).toBeNull();
    expect(stats.error).toBe('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  });

  it('un cero real del servidor sí se muestra como cero', () => {
    const stats = buildDashboardStats(ok({ pending: 0 }), ok({ pending_orders: 3 }));

    expect(stats.pendingOrders).toBe(0);
    expect(stats.pendingDeliveryOrders).toBe(3);
    expect(stats.error).toBeNull();
  });

  it('si solo falla una consulta, la otra conserva su número', () => {
    const stats = buildDashboardStats({ data: null, error: NETWORK_ERROR }, ok({ pending_orders: 7 }));

    expect(stats.pendingOrders).toBeNull();
    expect(stats.pendingDeliveryOrders).toBe(7);
    expect(stats.error).not.toBeNull();
  });

  it('sin permiso para órdenes de compra no se cuenta como fallo', () => {
    const stats = buildDashboardStats(null, ok({ pending_orders: 2 }));

    expect(stats.pendingOrders).toBeNull();
    expect(stats.pendingDeliveryOrders).toBe(2);
    expect(stats.error).toBeNull();
  });
});

describe('useDashboardStats', () => {
  let appStateListener: ((state: string) => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    mockedRpc.mockReset();
    mockedRpc.mockImplementation(async (fn: string) =>
      fn === 'get_purchase_orders_stats' ? ok({ pending: 1 }) : ok({ pending_orders: 4 })
    );
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    appStateListener = null;
  });

  const options = (overrides: Partial<DashboardStatsOptions> = {}): DashboardStatsOptions => ({
    includePurchaseOrders: true,
    focused: true,
    online: true,
    ...overrides,
  });

  const calledFunctions = () => mockedRpc.mock.calls.map(([fn]) => fn);

  it('ya no consulta get_reports_stats_today y el recaudador no consulta órdenes de compra', async () => {
    const { result } = renderHook(() => useDashboardStats(options({ includePurchaseOrders: false })));
    await act(async () => undefined);

    expect(calledFunctions()).toEqual(['get_delivery_orders_stats']);
    expect(result.current.pendingDeliveryOrders).toBe(4);
    expect(result.current.pendingOrders).toBeNull();
  });

  it('sin señal no consulta y no se queda «cargando»', async () => {
    const { result } = renderHook(() => useDashboardStats(options({ online: false })));
    await act(async () => undefined);

    expect(mockedRpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it('con la app en segundo plano deja de consultar y al volver refresca', async () => {
    renderHook(() => useDashboardStats(options()));
    await act(async () => undefined);
    expect(mockedRpc).toHaveBeenCalledTimes(2);

    act(() => appStateListener?.('background'));
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_MS * 3);
    });
    expect(mockedRpc).toHaveBeenCalledTimes(2);

    act(() => appStateListener?.('active'));
    await act(async () => undefined);
    expect(mockedRpc).toHaveBeenCalledTimes(4);
  });

  it('con Inicio a la vista refresca cada intervalo, no cada minuto', async () => {
    renderHook(() => useDashboardStats(options({ includePurchaseOrders: false })));
    await act(async () => undefined);
    expect(mockedRpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockedRpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_REFRESH_MS);
    });
    expect(mockedRpc).toHaveBeenCalledTimes(2);
  });

  it('en otra pestaña no consulta', async () => {
    renderHook(() => useDashboardStats(options({ focused: false })));
    await act(async () => undefined);
    expect(mockedRpc).not.toHaveBeenCalled();
  });
});
