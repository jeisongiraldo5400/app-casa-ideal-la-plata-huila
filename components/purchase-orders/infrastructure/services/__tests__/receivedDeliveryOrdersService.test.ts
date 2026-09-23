import { supabase } from '@/lib/supabase';
import { fetchReceivedDeliveryOrders } from '../receivedDeliveryOrdersService';
import { returnedQuantityGate } from '../returnedQuantityColumn';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const from = supabase.from as jest.Mock;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Deja correr las microtareas pendientes sin resolver ninguna consulta. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

type QueryResult = { data: unknown[] | null; error: unknown };

function builderFor(result: PromiseLike<QueryResult>) {
  const chain: Record<string, unknown> = {};
  ['select', 'is', 'eq', 'in', 'order', 'limit', 'returns'].forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain.range = jest.fn(() => result);
  chain.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

let started: string[] = [];
let results: Record<string, Deferred<QueryResult>>;

function mockTables() {
  started = [];
  results = {
    delivery_orders: deferred<QueryResult>(),
    profiles: deferred<QueryResult>(),
    delivery_order_items: deferred<QueryResult>(),
  };
  from.mockImplementation((table: string) => {
    started.push(table);
    return builderFor(results[table].promise);
  });
}

/** Resuelve las tres consultas y espera el resultado completo. */
async function resolveAll<T>(
  promise: Promise<T>,
  orders: unknown[],
  items: unknown[],
  profiles: unknown[] = [{ id: 'u-1', full_name: 'Administrador', email: 'adm@x' }],
) {
  await tick();
  results.delivery_orders.resolve({ data: orders, error: null });
  results.profiles.resolve({ data: profiles, error: null });
  await tick();
  results.delivery_order_items.resolve({ data: items, error: null });
  return promise;
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'oe-1',
    created_at: '2026-09-10T15:00:00Z',
    created_by: 'u-1',
    customer_id: 'c-1',
    assigned_to_user_id: null,
    order_type: 'customer',
    delivery_address: 'Calle 1',
    notes: null,
    status: 'delivered',
    order_number: 'OE-2026-0001',
    municipio_id: 'mun-1',
    vereda_id: null,
    customer: { id: 'c-1', name: 'Cliente Uno', id_number: '111' },
    assigned_to_user: null,
    municipio: { id: 'mun-1', nombre: 'Rionegro', departamento_id: 'dep-1', departamento: { id: 'dep-1', nombre: 'Antioquia' } },
    vereda: null,
    ...overrides,
  };
}

describe('fetchReceivedDeliveryOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    returnedQuantityGate.reset();
  });

  afterEach(() => jest.restoreAllMocks());

  it('pide las órdenes y el perfil del creador a la vez', async () => {
    mockTables();
    const promise = fetchReceivedDeliveryOrders('u-1');
    await tick();

    // Antes la consulta de perfiles esperaba a que llegaran las órdenes.
    expect(started).toEqual(['delivery_orders', 'profiles']);

    await resolveAll(promise, [orderRow()], []);
  });

  it('las líneas salen en cuanto se sabe qué órdenes hay', async () => {
    mockTables();
    const promise = fetchReceivedDeliveryOrders('u-1');
    await tick();
    results.delivery_orders.resolve({ data: [orderRow()], error: null });
    await tick();

    expect(started).toContain('delivery_order_items');
    results.profiles.resolve({ data: [], error: null });
    results.delivery_order_items.resolve({ data: [], error: null });
    await promise;
  });

  it('los lotes de líneas salen en paralelo cuando hay muchas órdenes', async () => {
    mockTables();
    // 400 órdenes → 3 lotes de ids (150 + 150 + 100) a la vez.
    const orders = Array.from({ length: 400 }, (_, index) => orderRow({ id: `oe-${index}` }));
    const promise = fetchReceivedDeliveryOrders('u-1');
    await tick();
    results.delivery_orders.resolve({ data: orders, error: null });
    results.profiles.resolve({ data: [], error: null });
    await tick();

    expect(started.filter((table) => table === 'delivery_order_items')).toHaveLength(3);

    results.delivery_order_items.resolve({ data: [], error: null });
    await expect(promise).resolves.toHaveLength(400);
  });

  it('cuenta igual que antes: una unidad resuelta ya marca el producto', async () => {
    mockTables();
    const promise = fetchReceivedDeliveryOrders('u-1');
    const orders = await resolveAll(
      promise,
      [orderRow()],
      [
        // 3 de 5 entregadas y 2 devueltas → la línea queda resuelta entera.
        { delivery_order_id: 'oe-1', quantity: 5, delivered_quantity: 3, returned_quantity: 2 },
        // Una sola unidad entregada de 4: el producto ya cuenta como entregado.
        { delivery_order_id: 'oe-1', quantity: 4, delivered_quantity: 1, returned_quantity: 0 },
        // Sin nada entregado: suma al total pero no a los entregados.
        { delivery_order_id: 'oe-1', quantity: 2, delivered_quantity: 0, returned_quantity: 0 },
      ],
    );

    expect(orders[0]).toMatchObject({
      id: 'oe-1',
      total_items: 3,
      total_quantity: 11,
      delivered_items: 2,
      delivered_quantity: 6,
    });
  });

  it('pinta los mismos campos que la tarjeta esperaba', async () => {
    mockTables();
    const promise = fetchReceivedDeliveryOrders('u-1');
    const orders = await resolveAll(promise, [orderRow()], []);

    expect(orders[0]).toMatchObject({
      order_number: 'OE-2026-0001',
      created_by_name: 'Administrador',
      customer_name: 'Cliente Uno',
      customer_id_number: '111',
      // La pantalla nunca trajo teléfono ni correo del cliente.
      customer_phone: null,
      customer_email: null,
      departamento_id: 'dep-1',
      departamento_name: 'Antioquia',
      municipio_name: 'Rionegro',
      vereda_name: null,
      status: 'delivered',
      // Sin líneas, todos los contadores en cero.
      total_items: 0,
      total_quantity: 0,
      delivered_items: 0,
      delivered_quantity: 0,
      items: [],
    });
  });

  it('filtra por creador y por los tres estados completados', async () => {
    mockTables();
    const chains: Record<string, unknown>[] = [];
    from.mockImplementation((table: string) => {
      started.push(table);
      const chain = builderFor(results[table].promise);
      if (table === 'delivery_orders') chains.push(chain);
      return chain;
    });

    const promise = fetchReceivedDeliveryOrders('u-1');
    await resolveAll(promise, [], []);

    const orderChain = chains[0];
    expect(orderChain.eq).toHaveBeenCalledWith('created_by', 'u-1');
    expect(orderChain.in).toHaveBeenCalledWith('status', ['delivered', 'approved', 'received']);
    expect(orderChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(orderChain.limit).toHaveBeenCalledWith(100);
  });

  it('si fallan las líneas devuelve las órdenes con los contadores en cero', async () => {
    mockTables();
    const promise = fetchReceivedDeliveryOrders('u-1');
    await tick();
    results.delivery_orders.resolve({ data: [orderRow()], error: null });
    results.profiles.resolve({ data: [], error: null });
    await tick();
    results.delivery_order_items.resolve({ data: null, error: { message: 'boom' } });

    const orders = await promise;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ total_items: 0, delivered_quantity: 0 });
  });

  it('un error al traer las órdenes se propaga con su mensaje', async () => {
    mockTables();
    const promise = fetchReceivedDeliveryOrders('u-1');
    await tick();
    results.delivery_orders.resolve({ data: null, error: { message: 'No autenticado' } });
    results.profiles.resolve({ data: [], error: null });

    await expect(promise).rejects.toThrow('No autenticado');
  });
});
