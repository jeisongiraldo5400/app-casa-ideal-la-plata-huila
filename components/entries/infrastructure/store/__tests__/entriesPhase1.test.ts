import { useEntriesStore, type EntryItem, type PurchaseOrderWithItems } from '../entriesStore';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/idempotency', () => ({
  createIdempotencyKey: jest.fn(() => 'key'),
  getOrCreatePersistentIdempotencyKey: jest.fn(async () => 'persistent-key'),
  clearPersistentIdempotencyKey: jest.fn(async () => undefined),
}));

jest.mock('@/lib/operationLogger', () => ({ logOperationError: jest.fn(async () => undefined) }));

jest.mock('../../services/entriesService', () => ({
  fetchBrands: jest.fn(async () => []),
  fetchCategories: jest.fn(async () => []),
  fetchPendingPurchaseOrders: jest.fn(async () => []),
  fetchPurchaseOrderItems: jest.fn(async () => []),
  fetchSuppliers: jest.fn(async () => { throw new Error('offline'); }),
  fetchWarehouses: jest.fn(async () => []),
}));

function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  ['select', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle', 'single'].forEach((method) => {
    obj[method] = jest.fn(() => obj);
  });
  obj.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

const product = { id: 'product-1', name: 'Silla', sku: 'SIL-1', barcode: '770123' } as EntryItem['product'];

const purchaseOrder = {
  id: 'po-1',
  order_number: 'OC-1',
  items: [{ id: 'poi-1', product_id: 'product-1', purchase_order_id: 'po-1', quantity: 3, product }],
} as unknown as PurchaseOrderWithItems;

describe('updateProductQuantity valida contra la orden de compra en cualquier tipo de entrada', () => {
  beforeEach(() => {
    useEntriesStore.getState().resetAll();
    useEntriesStore.setState({
      entryType: 'ENTRY',
      purchaseOrderId: 'po-1',
      selectedPurchaseOrder: purchaseOrder,
      registeredEntriesCache: { 'po-1': { 'product-1': 1 } },
      entryItems: [{ product, quantity: 1, barcode: '770123' }],
    });
  });

  it('rechaza superar lo pendiente de la orden con el stepper aunque entryType sea ENTRY', () => {
    useEntriesStore.getState().updateProductQuantity(0, 3);

    const state = useEntriesStore.getState();
    expect(state.entryItems[0].quantity).toBe(1);
    expect(state.error).toMatch(/excede/);
  });

  it('acepta una cantidad dentro de lo pendiente', () => {
    useEntriesStore.getState().updateProductQuantity(0, 2);

    const state = useEntriesStore.getState();
    expect(state.entryItems[0].quantity).toBe(2);
    expect(state.error).toBeNull();
  });
});

describe('catálogos', () => {
  it('expone catalogError cuando falla la carga en vez de dejar la lista vacía en silencio', async () => {
    useEntriesStore.getState().resetAll();

    await useEntriesStore.getState().loadSuppliers();

    expect(useEntriesStore.getState().suppliers).toEqual([]);
    expect(useEntriesStore.getState().catalogError).toMatch(/conexión/);
  });
});

describe('finalizeEntry cuando la pantalla se resetea durante el registro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'warehouses') return chain({ data: { id: 'wh-1', is_active: true, deleted_at: null }, error: null });
      if (table === 'products') return chain({ data: [{ id: 'product-1', deleted_at: null }], error: null });
      return chain({ data: null, error: null });
    });
    useEntriesStore.getState().resetAll();
    useEntriesStore.setState({
      entryType: 'ENTRY',
      warehouseId: 'wh-1',
      step: 'scanning',
      uiStage: 'entry_review',
      entryItems: [{ product, quantity: 2, barcode: '770123' }],
    });
  });

  it('guarda el resultado exitoso en lastFinalizeResult en lugar de revivir la pantalla de éxito', async () => {
    mockRpc.mockImplementation(async () => {
      // El operario cambia de pestaña mientras el RPC está en vuelo.
      useEntriesStore.getState().resetAll();
      return { data: { entry_ids: ['entry-1'] }, error: null };
    });

    const result = await useEntriesStore.getState().finalizeEntry('user-1');

    const state = useEntriesStore.getState();
    expect(result.ok).toBe(true);
    expect(state.step).toBe('flow-selection');
    expect(state.uiStage).toBe('idle');
    expect(state.loading).toBe(false);
    expect(state.lastFinalizeResult).toEqual(result);

    useEntriesStore.getState().dismissLastFinalizeResult();
    expect(useEntriesStore.getState().lastFinalizeResult).toBeNull();
  });

  it('un reset durante la validación deja un resultado de fallo visible y no registra nada', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'warehouses') {
        useEntriesStore.getState().resetAll();
      }
      if (table === 'warehouses') return chain({ data: { id: 'wh-1', is_active: true, deleted_at: null }, error: null });
      if (table === 'products') return chain({ data: [{ id: 'product-1', deleted_at: null }], error: null });
      return chain({ data: null, error: null });
    });

    const result = await useEntriesStore.getState().finalizeEntry('user-1');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(useEntriesStore.getState().lastFinalizeResult).toEqual(result);
    expect(useEntriesStore.getState().loading).toBe(false);
  });

  it('bloquea una segunda entrada mientras la primera sigue en vuelo tras el reset', async () => {
    let resolveRpc: (value: unknown) => void = () => undefined;
    mockRpc.mockImplementation(() => new Promise((resolve) => { resolveRpc = resolve; }));

    const first = useEntriesStore.getState().finalizeEntry('user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    useEntriesStore.getState().resetAll();
    useEntriesStore.setState({ entryType: 'ENTRY', warehouseId: 'wh-1', entryItems: [{ product, quantity: 1, barcode: '770123' }] });

    const second = await useEntriesStore.getState().finalizeEntry('user-1');
    expect(second.ok).toBe(false);
    expect(second.error?.message).toMatch(/Ya se está procesando/);

    resolveRpc({ data: { entry_ids: ['entry-1'] }, error: null });
    await first;
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
