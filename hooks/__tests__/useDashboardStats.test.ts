import { buildDashboardStats } from '@/hooks/useDashboardStats';

const NETWORK_ERROR = { message: 'TypeError: Network request failed', code: '' };

function ok(row: Record<string, unknown>) {
  return { data: [row], error: null };
}

describe('buildDashboardStats', () => {
  it('con error de red no devuelve 0: devuelve null para que el inicio pinte «—»', () => {
    const stats = buildDashboardStats(
      { data: null, error: NETWORK_ERROR },
      { data: null, error: NETWORK_ERROR },
      { data: null, error: NETWORK_ERROR }
    );

    expect(stats.pendingOrders).toBeNull();
    expect(stats.pendingDeliveryOrders).toBeNull();
    expect(stats.entriesToday).toBeNull();
    expect(stats.exitsToday).toBeNull();
    expect(stats.error).toBe('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  });

  it('un cero real del servidor sí se muestra como cero', () => {
    const stats = buildDashboardStats(
      ok({ entries_quantity_today: 0, exits_quantity_today: 4 }),
      ok({ pending: 0 }),
      ok({ pending_orders: 3 })
    );

    expect(stats.pendingOrders).toBe(0);
    expect(stats.pendingDeliveryOrders).toBe(3);
    expect(stats.exitsToday).toBe(4);
    expect(stats.error).toBeNull();
  });

  it('si solo falla una consulta, las demás conservan su número', () => {
    const stats = buildDashboardStats(
      ok({ entries_quantity_today: 2, exits_quantity_today: 1 }),
      { data: null, error: NETWORK_ERROR },
      ok({ pending_orders: 7 })
    );

    expect(stats.pendingOrders).toBeNull();
    expect(stats.pendingDeliveryOrders).toBe(7);
    expect(stats.error).not.toBeNull();
  });

  it('una consulta sin filas es cero, no un fallo', () => {
    const stats = buildDashboardStats(
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null }
    );

    expect(stats.pendingOrders).toBe(0);
    expect(stats.error).toBeNull();
  });
});
