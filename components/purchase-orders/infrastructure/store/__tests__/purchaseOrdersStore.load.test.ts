import { supabase } from '@/lib/supabase';
import { usePurchaseOrdersStore } from '../purchaseOrdersStore';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/operationLogger', () => ({ logOperationError: jest.fn() }));

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

/**
 * Builder mínimo de supabase-js: encadena, es «thenable» y admite `.range()`
 * (lo que usa `fetchInChunks` para paginar cada lote).
 */
function builderFor(result: PromiseLike<QueryResult>) {
  const chain: Record<string, unknown> = {};
  ['select', 'is', 'neq', 'order', 'limit', 'eq', 'in', 'returns'].forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain.range = jest.fn(() => result);
  chain.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

/** Tablas pedidas, en el orden en que salió cada consulta. */
let started: string[] = [];
let results: Record<string, Deferred<QueryResult>>;

function mockTables() {
  started = [];
  results = {
    purchase_orders: deferred<QueryResult>(),
    profiles: deferred<QueryResult>(),
    purchase_order_items: deferred<QueryResult>(),
  };
  const selects: Record<string, string[]> = {};
  from.mockImplementation((table: string) => {
    started.push(table);
    const chain = builderFor(results[table].promise);
    const select = chain.select as jest.Mock;
    select.mockImplementation((columns: string) => {
      (selects[table] ??= []).push(columns);
      return chain;
    });
    return chain;
  });
  return selects;
}

const order = {
  id: 'oc-1',
  order_number: 'OC-2026-0001',
  created_at: '2026-09-10T15:00:00Z',
  created_by: 'u-1',
  status: 'pending',
  notes: 'Urgente',
  supplier_id: 's-1',
  suppliers: { id: 's-1', name: 'Proveedor Uno', nit: '900' },
};

const profile = { id: 'u-1', full_name: 'Administrador', email: 'adm@x' };

const item = {
  id: 'it-1',
  purchase_order_id: 'oc-1',
  product_id: 'p-1',
  quantity: 3,
  created_at: '2026-09-10T15:00:00Z',
  products: { id: 'p-1', name: 'Nevera', barcode: '123' },
};

describe('purchaseOrdersStore · loadPurchaseOrders sin cascadas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    usePurchaseOrdersStore.setState({ purchaseOrders: [], loading: false, error: null });
  });

  afterEach(() => jest.restoreAllMocks());

  it('pide los perfiles y las líneas a la vez, no uno detrás de otro', async () => {
    mockTables();

    const loading = usePurchaseOrdersStore.getState().loadPurchaseOrders();
    await tick();
    // Nada puede salir antes de saber qué órdenes hay.
    expect(started).toEqual(['purchase_orders']);

    results.purchase_orders.resolve({ data: [order], error: null });
    await tick();
    // Las dos consultas siguientes ya están en vuelo aunque ninguna respondió
    // todavía: antes la de líneas esperaba a la de perfiles.
    expect(started).toEqual(['purchase_orders', 'profiles', 'purchase_order_items']);

    results.profiles.resolve({ data: [profile], error: null });
    results.purchase_order_items.resolve({ data: [item], error: null });
    await loading;

    expect(usePurchaseOrdersStore.getState().loading).toBe(false);
  });

  it('devuelve lo mismo que antes: proveedor, creador e ítems con su producto', async () => {
    mockTables();
    const loading = usePurchaseOrdersStore.getState().loadPurchaseOrders();
    await tick();
    results.purchase_orders.resolve({ data: [order], error: null });
    await tick();
    results.profiles.resolve({ data: [profile], error: null });
    results.purchase_order_items.resolve({ data: [item], error: null });
    await loading;

    const [loaded] = usePurchaseOrdersStore.getState().purchaseOrders;
    expect(loaded).toMatchObject({
      id: 'oc-1',
      order_number: 'OC-2026-0001',
      created_at: '2026-09-10T15:00:00Z',
      status: 'pending',
      notes: 'Urgente',
      supplier: { id: 's-1', name: 'Proveedor Uno', nit: '900' },
      created_by_profile: { id: 'u-1', full_name: 'Administrador', email: 'adm@x' },
    });
    expect(loaded.items).toEqual([
      {
        id: 'it-1',
        purchase_order_id: 'oc-1',
        product_id: 'p-1',
        quantity: 3,
        created_at: '2026-09-10T15:00:00Z',
        product: { id: 'p-1', name: 'Nevera', barcode: '123' },
      },
    ]);
  });

  it('trae solo las columnas que pinta la tarjeta, sin «*»', async () => {
    const selects = mockTables();
    const loading = usePurchaseOrdersStore.getState().loadPurchaseOrders();
    await tick();
    results.purchase_orders.resolve({ data: [order], error: null });
    await tick();
    results.profiles.resolve({ data: [profile], error: null });
    results.purchase_order_items.resolve({ data: [item], error: null });
    await loading;

    const orderSelect = selects.purchase_orders[0];
    expect(orderSelect).not.toContain('*');
    ['id', 'order_number', 'created_at', 'created_by', 'status', 'notes', 'suppliers:supplier_id'].forEach(
      (column) => expect(orderSelect).toContain(column),
    );

    const itemSelect = selects.purchase_order_items[0];
    expect(itemSelect).not.toContain('*');
    ['purchase_order_id', 'product_id', 'quantity', 'products:product_id'].forEach((column) =>
      expect(itemSelect).toContain(column),
    );
  });

  it('los lotes de líneas salen en paralelo cuando hay muchas órdenes', async () => {
    mockTables();
    // 400 órdenes → 3 lotes de ids (150 + 150 + 100) que arrancan a la vez.
    const orders = Array.from({ length: 400 }, (_, index) => ({
      ...order,
      id: `oc-${index}`,
    }));

    const loading = usePurchaseOrdersStore.getState().loadPurchaseOrders();
    await tick();
    results.purchase_orders.resolve({ data: orders, error: null });
    await tick();

    expect(started.filter((table) => table === 'purchase_order_items')).toHaveLength(3);

    results.profiles.resolve({ data: [profile], error: null });
    results.purchase_order_items.resolve({ data: [], error: null });
    await loading;
    expect(usePurchaseOrdersStore.getState().purchaseOrders).toHaveLength(400);
  });

  it('sin órdenes no pide perfiles ni líneas', async () => {
    mockTables();
    const loading = usePurchaseOrdersStore.getState().loadPurchaseOrders();
    await tick();
    results.purchase_orders.resolve({ data: [], error: null });
    await loading;

    expect(started).toEqual(['purchase_orders']);
    expect(usePurchaseOrdersStore.getState().purchaseOrders).toEqual([]);
  });

  it('si fallan las líneas el listado sigue vivo sin ítems', async () => {
    mockTables();
    const loading = usePurchaseOrdersStore.getState().loadPurchaseOrders();
    await tick();
    results.purchase_orders.resolve({ data: [order], error: null });
    await tick();
    results.profiles.resolve({ data: [profile], error: null });
    results.purchase_order_items.resolve({ data: null, error: { message: 'boom' } });
    await loading;

    const state = usePurchaseOrdersStore.getState();
    expect(state.error).toBeNull();
    expect(state.purchaseOrders[0].items).toEqual([]);
  });
});
