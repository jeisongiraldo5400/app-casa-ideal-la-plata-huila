import { useExitsStore, type DeliveryOrder, type DeliveryOrderItem, type ExitItem } from '../exitsStore';

const mockFetchWarehouseStock = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
}));

jest.mock('@/components/exits/infrastructure/services/exitsService', () => ({
  fetchActiveProfiles: jest.fn(async () => []),
  searchCustomersByTerm: jest.fn(async () => []),
  fetchWarehouseStock: (...args: unknown[]) => mockFetchWarehouseStock(...args),
}));

jest.mock('@/lib/operationLogger', () => ({ logOperationError: jest.fn(async () => undefined) }));

/** Query builder falso: cada método devuelve el mismo objeto y es thenable. */
function chain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const obj: Record<string, unknown> = {};
  ['select', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle', 'single'].forEach((method) => {
    obj[method] = jest.fn(() => obj);
  });
  obj.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

function line(partial: Partial<DeliveryOrderItem> & Pick<DeliveryOrderItem, 'id' | 'product_id' | 'warehouse_id' | 'quantity'>): DeliveryOrderItem {
  return {
    product_name: `Producto ${partial.product_id}`,
    product_barcode: '770123',
    product_sku: 'SKU',
    warehouse_name: partial.warehouse_id === 'warehouse-1' ? 'Bodega principal' : 'Bodega norte',
    delivered_quantity: 0,
    pending_quantity: partial.quantity,
    db_delivered_quantity: 0,
    created_at: '2026-08-21T10:00:00.000Z',
    source_delivery_order_id: null,
    group_key: 'own',
    ...partial,
  };
}

/** Copia de una OE hija anidada en la remisión. */
function childLine(childId: string, number: string, customer: string, partial: Parameters<typeof line>[0]): DeliveryOrderItem {
  return line({ source_delivery_order_id: childId, group_key: childId, source_order_number: number, source_customer_name: customer, ...partial });
}

const OWN_CANDIDATE = { groupKey: 'own', groupLabel: 'Productos de la orden', targetOrderId: 'order-1' };

const product = { id: 'product-1', name: 'Silla comedor', sku: 'SIL-1', barcode: '770123' } as ExitItem['product'];

function makeOrder(items: DeliveryOrderItem[]): DeliveryOrder {
  return {
    id: 'order-1',
    order_number: 'OE-1',
    customer_id: 'customer-1',
    customer_name: 'Cliente prueba',
    customer_id_number: '123',
    status: 'pending',
    delivery_address: null,
    notes: null,
    created_at: '2026-08-21T10:00:00.000Z',
    items,
  };
}

const multiWarehouseOrder = makeOrder([
  line({ id: 'item-1', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3, created_at: '2026-08-21T10:00:00.000Z' }),
  line({ id: 'item-2', product_id: 'product-1', warehouse_id: 'warehouse-2', quantity: 2, created_at: '2026-08-21T11:00:00.000Z' }),
  line({ id: 'item-3', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3, created_at: '2026-08-21T12:00:00.000Z' }),
]);

const singleWarehouseOrder = makeOrder([
  line({ id: 'item-1', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3, created_at: '2026-08-21T10:00:00.000Z' }),
  line({ id: 'item-3', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3, created_at: '2026-08-21T12:00:00.000Z' }),
]);

/** Remisión mixta: el mismo producto+bodega en propios y en la copia de una OE hija, más otra hija. */
const mixedRemission: DeliveryOrder = {
  ...makeOrder([
    childLine('child-b', 'OE-0020', 'Cliente Sur', { id: 'copy-b', product_id: 'product-2', warehouse_id: 'warehouse-1', quantity: 1 }),
    line({ id: 'own-1', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3 }),
    childLine('child-a', 'OE-0012', 'Cliente Norte', { id: 'copy-a', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 2 }),
  ]),
  order_type: 'remission',
  customer_name: '',
  assigned_to_user_name: 'Carlos Rutas',
};

const originalActions = {
  searchProductByBarcode: useExitsStore.getState().searchProductByBarcode,
  validateCurrentUserAuthorizationForOrder: useExitsStore.getState().validateCurrentUserAuthorizationForOrder,
};

function seed(order: DeliveryOrder) {
  useExitsStore.getState().resetAll();
  useExitsStore.setState({
    ...originalActions,
    step: 'scanning',
    exitMode: 'direct_customer',
    selectedCustomerId: 'customer-1',
    selectedDeliveryOrderId: order.id,
    selectedDeliveryOrder: order,
    registeredExitsCache: { [order.id]: {} },
    scannedItemsProgress: new Map(),
    exitItems: [],
    canRegisterExit: true,
    searchProductByBarcode: jest.fn(async () => product),
  });
}

describe('scanBarcode: resolución de bodega y stock físico', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWarehouseStock.mockResolvedValue(10);
    mockFrom.mockImplementation(() => chain());
  });

  it('con pendientes en dos bodegas no elige por FIFO: deja candidatas y espera al operario', async () => {
    seed(multiWarehouseOrder);

    await useExitsStore.getState().scanBarcode('770123');

    const state = useExitsStore.getState();
    expect(state.currentProduct).toEqual(product);
    expect(state.warehouseId).toBeNull();
    expect(state.targetOrderItemId).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.warehouseCandidates).toEqual([
      { warehouseId: 'warehouse-1', warehouseName: 'Bodega principal', pending: 6, ...OWN_CANDIDATE },
      { warehouseId: 'warehouse-2', warehouseName: 'Bodega norte', pending: 2, ...OWN_CANDIDATE },
    ]);
    expect(mockFetchWarehouseStock).not.toHaveBeenCalled();
  });

  it('remisión mixta: el mismo producto en propios y en una OE hija da dos candidatas (grupo + bodega)', async () => {
    seed(mixedRemission);

    await useExitsStore.getState().scanBarcode('770123');

    const state = useExitsStore.getState();
    expect(state.warehouseId).toBeNull();
    expect(state.currentGroupKey).toBeNull();
    expect(state.warehouseCandidates).toEqual([
      { warehouseId: 'warehouse-1', warehouseName: 'Bodega principal', pending: 3, groupKey: 'own', groupLabel: 'Productos de la remisión', targetOrderId: 'order-1' },
      { warehouseId: 'warehouse-1', warehouseName: 'Bodega principal', pending: 2, groupKey: 'child-a', groupLabel: 'OE-0012 · Cliente Norte', targetOrderId: 'child-a' },
    ]);
    expect(mockFetchWarehouseStock).not.toHaveBeenCalled();
  });

  it('elegir la OE hija fija su línea, su pendiente y registra el producto contra la hija', async () => {
    seed(mixedRemission);
    await useExitsStore.getState().scanBarcode('770123');

    await useExitsStore.getState().selectScanWarehouse('warehouse-1', 'child-a');

    const state = useExitsStore.getState();
    expect(state.currentGroupKey).toBe('child-a');
    expect(state.targetOrderItemId).toBe('copy-a');
    expect(state.currentAvailableStock).toBe(2);

    const result = await useExitsStore.getState().addProductToExit(product, 2, '770123');
    expect(result).toEqual({ ok: true, error: null });
    expect(useExitsStore.getState().exitItems[0]).toEqual(
      expect.objectContaining({ quantity: 2, warehouseId: 'warehouse-1', groupKey: 'child-a', targetOrderId: 'child-a' })
    );
    expect(useExitsStore.getState().scannedItemsProgress.get('product-1-warehouse-1::child-a')).toBe(2);
    expect(useExitsStore.getState().scannedItemsProgress.get('product-1-warehouse-1::own')).toBeUndefined();

    // Los propios siguen con sus 3 pendientes: al volver a escanear solo queda esa candidata.
    await useExitsStore.getState().scanBarcode('770123');
    expect(useExitsStore.getState().warehouseCandidates).toEqual([
      expect.objectContaining({ groupKey: 'own', pending: 3 }),
    ]);
  });

  it('sin indicar grupo, una bodega con candidatas en dos grupos exige elegir la orden', async () => {
    seed(mixedRemission);
    await useExitsStore.getState().scanBarcode('770123');

    await useExitsStore.getState().selectScanWarehouse('warehouse-1');

    expect(useExitsStore.getState().warehouseId).toBeNull();
    expect(useExitsStore.getState().error).toMatch(/Elige la orden/);
  });

  it('lo registrado en la OE hija (su propio slot de caché) descuenta solo a la hija', async () => {
    seed(mixedRemission);
    useExitsStore.setState({ registeredExitsCache: { 'order-1': {}, 'child-a': { 'product-1-warehouse-1': 2 } } });

    await useExitsStore.getState().scanBarcode('770123');

    const state = useExitsStore.getState();
    expect(state.warehouseCandidates).toEqual([expect.objectContaining({ groupKey: 'own', pending: 3 })]);
    expect(state.currentGroupKey).toBe('own');
    expect(state.warehouseId).toBe('warehouse-1');
  });

  it('el progreso se divide en secciones: propios primero y luego las hijas por número', () => {
    seed(mixedRemission);
    useExitsStore.setState({
      exitItems: [{ product, quantity: 1, barcode: '770123', warehouseId: 'warehouse-1', groupKey: 'child-a', targetOrderId: 'child-a' }],
      scannedItemsProgress: new Map([['product-1-warehouse-1::child-a', 1]]),
      registeredExitsCache: { 'order-1': { 'product-1-warehouse-1': 1 } },
    });

    const progress = useExitsStore.getState().getSelectedDeliveryOrderProgress();

    expect(progress?.sections.map((section) => [section.groupKey, section.label, section.targetOrderId])).toEqual([
      ['own', 'Productos de la remisión', 'order-1'],
      ['child-a', 'OE-0012 · Cliente Norte', 'child-a'],
      ['child-b', 'OE-0020 · Cliente Sur', 'child-b'],
    ]);
    expect(progress?.sections[0]).toEqual(expect.objectContaining({ totalRequired: 3, totalRegistered: 1, totalScanned: 0 }));
    expect(progress?.sections[1]).toEqual(expect.objectContaining({ totalRequired: 2, totalRegistered: 0, totalScanned: 1 }));
    expect(progress?.items.map((item) => item.item.id)).toEqual(['own-1', 'copy-a', 'copy-b']);
    expect(progress?.totalRequired).toBe(6);
  });

  it('selectScanWarehouse fija la bodega elegida, la línea FIFO de esa bodega y consulta su stock', async () => {
    seed(multiWarehouseOrder);
    await useExitsStore.getState().scanBarcode('770123');
    mockFetchWarehouseStock.mockResolvedValue(4);

    await useExitsStore.getState().selectScanWarehouse('warehouse-2');

    const state = useExitsStore.getState();
    expect(mockFetchWarehouseStock).toHaveBeenCalledWith('product-1', 'warehouse-2');
    expect(state.warehouseId).toBe('warehouse-2');
    expect(state.targetOrderItemId).toBe('item-2');
    expect(state.currentAvailableStock).toBe(2);
    expect(state.currentPhysicalStock).toBe(4);
    expect(state.currentQuantity).toBe(1);
    expect(state.loading).toBe(false);
  });

  it('con una sola bodega se resuelve sola y el pendiente es el agregado de todas sus líneas', async () => {
    seed(singleWarehouseOrder);

    await useExitsStore.getState().scanBarcode('770123');

    const state = useExitsStore.getState();
    expect(state.warehouseId).toBe('warehouse-1');
    expect(state.targetOrderItemId).toBe('item-1');
    expect(state.currentAvailableStock).toBe(6);
    expect(state.currentPhysicalStock).toBe(10);
    expect(mockFetchWarehouseStock).toHaveBeenCalledWith('product-1', 'warehouse-1');
  });

  it('sin stock físico deja la cantidad en 0 y rechaza agregar', async () => {
    seed(singleWarehouseOrder);
    mockFetchWarehouseStock.mockResolvedValue(0);

    await useExitsStore.getState().scanBarcode('770123');
    expect(useExitsStore.getState().currentQuantity).toBe(0);

    const result = await useExitsStore.getState().addProductToExit(product, 1, '770123');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Stock físico insuficiente');
    expect(useExitsStore.getState().exitItems).toHaveLength(0);
  });

  it('el stock físico acota la cantidad aunque la orden tenga más pendiente', async () => {
    seed(singleWarehouseOrder);
    mockFetchWarehouseStock.mockResolvedValue(2);
    await useExitsStore.getState().scanBarcode('770123');

    const rejected = await useExitsStore.getState().addProductToExit(product, 3, '770123');
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain('Disponible: 2');

    const accepted = await useExitsStore.getState().addProductToExit(product, 2, '770123');
    expect(accepted).toEqual({ ok: true, error: null });
    expect(useExitsStore.getState().exitItems[0]).toEqual(
      expect.objectContaining({ quantity: 2, warehouseId: 'warehouse-1', physicalStock: 2, availableStock: 0 })
    );
  });

  it('si la consulta de stock falla, sigue con el pendiente de la orden', async () => {
    seed(singleWarehouseOrder);
    mockFetchWarehouseStock.mockRejectedValue(new Error('network'));

    await useExitsStore.getState().scanBarcode('770123');

    expect(useExitsStore.getState().currentPhysicalStock).toBeNull();
    const result = await useExitsStore.getState().addProductToExit(product, 5, '770123');
    expect(result.ok).toBe(true);
  });

  it('un fallo de red al buscar el producto no se reporta como "código no registrado"', async () => {
    seed(singleWarehouseOrder);
    useExitsStore.setState({ searchProductByBarcode: jest.fn(async () => { throw new Error('fetch failed'); }) });

    await useExitsStore.getState().scanBarcode('770123');

    const state = useExitsStore.getState();
    expect(state.error).toMatch(/conexión/);
    expect(state.error).not.toMatch(/no está registrado/);
    expect(state.currentProduct).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('distingue "ya agregado en esta salida" de "ya entregado en la orden"', async () => {
    seed(singleWarehouseOrder);
    useExitsStore.setState({
      exitItems: [{ product, quantity: 6, barcode: '770123', warehouseId: 'warehouse-1' }],
      scannedItemsProgress: new Map([['product-1-warehouse-1::own', 6]]),
    });

    await useExitsStore.getState().scanBarcode('770123');
    expect(useExitsStore.getState().error).toMatch(/Ya agregaste todas las unidades pendientes/);

    seed(singleWarehouseOrder);
    useExitsStore.setState({ registeredExitsCache: { 'order-1': { 'product-1-warehouse-1': 6 } } });
    await useExitsStore.getState().scanBarcode('770123');
    expect(useExitsStore.getState().error).toMatch(/ya fue entregado completamente/);
  });

  it('una lectura que resuelve después de resetAll no escribe sobre el store limpio', async () => {
    seed(singleWarehouseOrder);
    let resolveLookup: (value: ExitItem['product']) => void = () => undefined;
    useExitsStore.setState({
      searchProductByBarcode: jest.fn(() => new Promise<ExitItem['product'] | null>((resolve) => { resolveLookup = resolve; })),
    });

    const pending = useExitsStore.getState().scanBarcode('770123');
    useExitsStore.getState().resetAll();
    resolveLookup(product);
    await pending;

    const state = useExitsStore.getState();
    expect(state.currentProduct).toBeNull();
    expect(state.step).toBe('setup');
    expect(state.loading).toBe(false);
    expect(mockFetchWarehouseStock).not.toHaveBeenCalled();
  });
});

describe('selectDeliveryOrder: cambio de destinatario durante la carga', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => chain());
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('descarta la orden A cuando el operario cambió de cliente antes de que A terminara de cargar', async () => {
    seed(singleWarehouseOrder);
    useExitsStore.setState({ selectedDeliveryOrderId: null, selectedDeliveryOrder: null, step: 'setup' });
    let resolveRpc: (value: unknown) => void = () => undefined;
    mockRpc.mockImplementation(() => new Promise((resolve) => { resolveRpc = resolve; }));

    const pending = useExitsStore.getState().selectDeliveryOrder('order-1', { id: 'order-1', customer_name: 'Cliente A' });
    expect(useExitsStore.getState().loading).toBe(true);

    useExitsStore.getState().setSelectedCustomer('customer-2');
    resolveRpc({
      data: [{
        id: 'item-1', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3, delivered_quantity: 0,
        created_at: '2026-08-21T10:00:00.000Z', source_delivery_order_id: null,
        product_name: 'Silla', product_barcode: '770123', product_sku: 'SIL', warehouse_name: 'Bodega principal',
      }],
      error: null,
    });
    await pending;

    const state = useExitsStore.getState();
    expect(state.selectedCustomerId).toBe('customer-2');
    expect(state.selectedDeliveryOrderId).toBeNull();
    expect(state.selectedDeliveryOrder).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('una remisión mixta carga las salidas de la remisión y de cada OE hija en slots separados', async () => {
    seed(singleWarehouseOrder);
    useExitsStore.setState({ selectedDeliveryOrderId: null, selectedDeliveryOrder: null, step: 'setup', registeredExitsCache: {} });
    const exitsChain = chain({
      data: [
        { id: 'exit-own', delivery_order_id: 'order-1', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 1 },
        { id: 'exit-child', delivery_order_id: 'child-a', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 2 },
      ],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => (table === 'inventory_exits' ? exitsChain : chain()));
    const rpcRow = (id: string, source: string | null) => ({
      id, product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 3, delivered_quantity: 0,
      created_at: '2026-08-21T10:00:00.000Z', source_delivery_order_id: source,
      source_order_number: source ? 'OE-0012' : null, source_customer_name: source ? 'Cliente Norte' : null, source_order_status: null,
      product_name: 'Silla', product_barcode: '770123', product_sku: 'SIL', warehouse_name: 'Bodega principal',
    });
    mockRpc.mockResolvedValue({ data: [rpcRow('own-1', null), rpcRow('copy-a', 'child-a')], error: null });

    await useExitsStore.getState().selectDeliveryOrder('order-1', { id: 'order-1', order_type: 'remission', assigned_to_user_name: 'Carlos' });

    const state = useExitsStore.getState();
    expect(exitsChain.in).toHaveBeenCalledWith('delivery_order_id', ['order-1', 'child-a']);
    expect(state.registeredExitsCache).toEqual({
      'order-1': { 'product-1-warehouse-1': 1 },
      'child-a': { 'product-1-warehouse-1': 2 },
    });
    expect(state.selectedDeliveryOrder?.items.map((item) => [item.id, item.group_key, item.delivered_quantity])).toEqual([
      ['own-1', 'own', 1],
      ['copy-a', 'child-a', 2],
    ]);
  });
});

describe('finalizeExit: autorización y sincronización', () => {
  const exitItem: ExitItem = { product, quantity: 2, barcode: '770123', warehouseId: 'warehouse-1', physicalStock: 5 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => chain());
    mockRpc.mockResolvedValue({ data: { exit_ids: ['exit-1'] }, error: null });
  });

  it('no repite la autorización cuando ya se verificó para la misma orden al seleccionarla', async () => {
    seed(singleWarehouseOrder);
    const validate = jest.fn(async () => ({ canRegister: true, message: null }));
    useExitsStore.setState({
      exitItems: [exitItem],
      authorizationCheckedOrderId: 'order-1',
      validateCurrentUserAuthorizationForOrder: validate,
    });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok).toBe(true);
    expect(validate).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('register_inventory_exits_batch', expect.objectContaining({ p_delivery_order_id: 'order-1' }));
    expect(useExitsStore.getState().loading).toBe(false);
  });

  it('sí verifica la autorización cuando no consta para esa orden', async () => {
    seed(singleWarehouseOrder);
    const validate = jest.fn(async () => ({ canRegister: true, message: null }));
    useExitsStore.setState({
      exitItems: [exitItem],
      authorizationCheckedOrderId: null,
      validateCurrentUserAuthorizationForOrder: validate,
    });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok).toBe(true);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(useExitsStore.getState().authorizationCheckedOrderId).toBe('order-1');
  });

  it('devuelve un error tipado con el mensaje del RPC', async () => {
    seed(singleWarehouseOrder);
    useExitsStore.setState({ exitItems: [exitItem], authorizationCheckedOrderId: 'order-1' });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Stock insuficiente', code: 'P0001', details: null, hint: null } });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ message: 'Stock insuficiente', code: 'P0001' }), summary: null });
    expect(useExitsStore.getState().loading).toBe(false);
  });
});
