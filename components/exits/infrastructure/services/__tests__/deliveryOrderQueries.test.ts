import { supabase } from '@/lib/supabase';
import {
  fetchDeliveredTotalsByOrder,
  fetchInventoryExitsForOrders,
  getActiveCancelledExitIds,
} from '../deliveryOrderQueries';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

type Row = Record<string, unknown>;
type InCall = { table: string; column: string; values: string[] };

const uuid = (prefix: string, i: number) => `${prefix}${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;

/**
 * PostgREST falso: filtra por `.in`/`.is`, ordena, respeta `.range` y limita cada
 * respuesta a 1000 filas como `max-rows`. Falla con 400 si el filtro `in.(…)`
 * supera ~15 KB, como el proyecto real con 1000 UUID.
 */
function fakePostgrest(tables: Record<string, Row[]>, options: { failOn?: (call: InCall) => boolean } = {}) {
  const inCalls: InCall[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let current: InCall | null = null;
    let range: [number, number] | null = null;
    const run = () => {
      if (current && (current.values.join(',').length > 15_000 || options.failOn?.(current))) {
        return { data: null, error: { message: 'Bad Request', code: '' } };
      }
      const rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
      const [from, to] = range || [0, rows.length - 1];
      return { data: rows.slice(from, Math.min(to, from + 999) + 1), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: (column: string, values: string[]) => {
        current = { table, column, values };
        inCalls.push(current);
        const set = new Set(values);
        filters.push((row) => set.has(row[column] as string));
        return chain;
      },
      is: (column: string, value: null) => {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      order: () => chain,
      returns: () => chain,
      range: (from: number, to: number) => {
        range = [from, to];
        return Promise.resolve(run());
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  });
  return inCalls;
}

describe('consultas de órdenes de entrega con miles de ids', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getActiveCancelledExitIds con 2367 salidas no devuelve «Bad Request» y encuentra todas las cancelaciones', async () => {
    const exitIds = Array.from({ length: 2367 }, (_, i) => uuid('e', i));
    const cancellations = [
      { inventory_exit_id: exitIds[3], deleted_at: null },
      { inventory_exit_id: exitIds[1200], deleted_at: null },
      { inventory_exit_id: exitIds[2366], deleted_at: null },
      // Cancelación revertida: la salida vuelve a contar.
      { inventory_exit_id: exitIds[500], deleted_at: '2026-09-01T00:00:00Z' },
    ];
    const inCalls = fakePostgrest({ inventory_exit_cancellations: cancellations });

    const cancelled = await getActiveCancelledExitIds(exitIds);

    expect(cancelled).toEqual(new Set([exitIds[3], exitIds[1200], exitIds[2366]]));
    expect(inCalls.length).toBe(Math.ceil(2367 / 150));
    expect(inCalls.every((call) => call.values.length <= 150)).toBe(true);
    // ~6 KB de URL como máximo por petición.
    expect(Math.max(...inCalls.map((call) => call.values.join(',').length))).toBeLessThan(6_000);
  });

  it('getActiveCancelledExitIds conserva el mensaje en español si un lote falla', async () => {
    const exitIds = Array.from({ length: 1000 }, (_, i) => uuid('e', i));
    fakePostgrest({ inventory_exit_cancellations: [] }, { failOn: (call) => call.values.includes(exitIds[700]) });

    await expect(getActiveCancelledExitIds(exitIds)).rejects.toThrow(
      'No fue posible verificar las salidas canceladas: Bad Request'
    );
  });

  it('fetchInventoryExitsForOrders con 1771 órdenes trae todas las salidas aunque superen max-rows', async () => {
    const orderIds = Array.from({ length: 1771 }, (_, i) => uuid('o', i));
    // Varias salidas por orden: 5313 filas, más de 1000 dentro de un mismo lote de 150 órdenes.
    const exits = orderIds.flatMap((orderId, i) =>
      [0, 1, 2].map((n) => ({ id: uuid('x', i * 3 + n), delivery_order_id: orderId, product_id: 'p', warehouse_id: 'w', quantity: 1 }))
    );
    const inCalls = fakePostgrest({ inventory_exits: exits });

    const rows = await fetchInventoryExitsForOrders(orderIds);

    expect(rows).toHaveLength(exits.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(exits.length);
    expect(inCalls.every((call) => call.column === 'delivery_order_id' && call.values.length <= 150)).toBe(true);
  });

  it('fetchInventoryExitsForOrders propaga el error del lote', async () => {
    const orderIds = Array.from({ length: 1200 }, (_, i) => uuid('o', i));
    fakePostgrest({ inventory_exits: [] }, { failOn: (call) => call.values.includes(orderIds[1199]) });
    await expect(fetchInventoryExitsForOrders(orderIds)).rejects.toMatchObject({ message: 'Bad Request' });
  });

  it('fetchDeliveredTotalsByOrder con 1200 órdenes suma por orden sin perder filas', async () => {
    const orderIds = Array.from({ length: 1200 }, (_, i) => uuid('o', i));
    const items = orderIds.flatMap((orderId) => [
      { delivery_order_id: orderId, quantity: 2, delivered_quantity: 2, returned_quantity: 0, deleted_at: null },
      { delivery_order_id: orderId, quantity: 4, delivered_quantity: 3, returned_quantity: 0, deleted_at: null },
      { delivery_order_id: orderId, quantity: 50, delivered_quantity: 50, returned_quantity: 0, deleted_at: '2026-09-01T00:00:00Z' },
    ]);
    const inCalls = fakePostgrest({ delivery_order_items: items });

    const totals = await fetchDeliveredTotalsByOrder(orderIds);

    expect(totals.size).toBe(1200);
    expect([...totals.values()].every((total) => total === 5)).toBe(true);
    expect(inCalls.every((call) => call.values.length <= 150)).toBe(true);
  });

  it('fetchDeliveredTotalsByOrder cuenta lo devuelto como resuelto y no pasa de lo pedido', async () => {
    const orderId = uuid('o', 1);
    fakePostgrest({
      delivery_order_items: [
        // Una unidad devuelta: `delivered_quantity` bajó, pero la línea está cerrada.
        { delivery_order_id: orderId, quantity: 3, delivered_quantity: 2, returned_quantity: 1, deleted_at: null },
        // Nunca por encima de lo pedido aunque los contadores vengan inflados.
        { delivery_order_id: orderId, quantity: 2, delivered_quantity: 2, returned_quantity: 2, deleted_at: null },
      ],
    });

    await expect(fetchDeliveredTotalsByOrder([orderId])).resolves.toEqual(new Map([[orderId, 5]]));
  });

  it('sin ids no consulta', async () => {
    fakePostgrest({});
    await expect(getActiveCancelledExitIds([])).resolves.toEqual(new Set());
    await expect(fetchInventoryExitsForOrders([])).resolves.toEqual([]);
    await expect(fetchDeliveredTotalsByOrder([])).resolves.toEqual(new Map());
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
