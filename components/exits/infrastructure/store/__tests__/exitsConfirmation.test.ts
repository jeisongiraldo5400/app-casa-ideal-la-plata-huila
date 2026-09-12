import { useExitsStore, type DeliveryOrder, type ExitItem } from '../exitsStore';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  },
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

const order: DeliveryOrder = {
  id: 'order-1',
  order_number: 'OE-1',
  customer_id: 'customer-1',
  customer_name: 'Cliente prueba',
  customer_id_number: '123',
  status: 'pending',
  delivery_address: 'Calle 1',
  notes: null,
  created_at: '2026-08-21T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      product_id: 'product-1',
      product_name: 'Producto 1',
      product_barcode: '123',
      product_sku: 'P-1',
      warehouse_id: 'warehouse-1',
      warehouse_name: 'Principal',
      quantity: 3,
      delivered_quantity: 0,
      pending_quantity: 3,
      db_delivered_quantity: 0,
      created_at: '2026-08-21T10:00:00.000Z',
      source_delivery_order_id: null,
      group_key: 'own',
    },
  ],
};

const product = { id: 'product-1', name: 'Producto 1', sku: 'P-1', barcode: '123' } as ExitItem['product'];
const ownItem: ExitItem = { product, quantity: 2, barcode: '123', warehouseId: 'warehouse-1', groupKey: 'own', targetOrderId: 'order-1' };
const childItem: ExitItem = {
  product: { ...product, id: 'product-2', name: 'Producto 2' } as ExitItem['product'],
  quantity: 1,
  barcode: '456',
  warehouseId: 'warehouse-1',
  groupKey: 'child-1',
  targetOrderId: 'child-1',
  serials: [{ serial: 'ab-1', normalized: 'AB1', method: 'scan' }],
};

describe('flujo de confirmación de salidas', () => {
  beforeEach(() => {
    useExitsStore.setState({
      step: 'setup',
      exitMode: 'direct_customer',
      selectedCustomerId: 'customer-1',
      selectedUserId: null,
      selectedDeliveryOrderId: order.id,
      selectedDeliveryOrder: order,
      deliveryOrders: [order],
      canRegisterExit: true,
      authorizationMessage: null,
      deliveryObservations: '',
      error: null,
      registeredExitsCache: { [order.id]: {} },
      scannedItemsProgress: new Map(),
      exitItems: [],
    });
  });

  it('valida la configuración y pasa directo de setup a scanning con una orden válida', () => {
    expect(useExitsStore.getState().openExitConfirmation()).toBe(true);
    expect(useExitsStore.getState().step).toBe('setup');

    useExitsStore.getState().startExit();
    expect(useExitsStore.getState().step).toBe('scanning');
  });

  it('mantiene la lista visible cuando falta autorización', () => {
    useExitsStore.setState({ canRegisterExit: false, authorizationMessage: 'Sin permiso' });

    expect(useExitsStore.getState().openExitConfirmation()).toBe(false);
    expect(useExitsStore.getState().step).toBe('setup');
    expect(useExitsStore.getState().error).toBe('Sin permiso');
  });

  it('mantiene la lista visible cuando la orden ya está completa', () => {
    useExitsStore.setState({
      registeredExitsCache: {
        [order.id]: { 'product-1-warehouse-1': 3 },
      },
    });

    expect(useExitsStore.getState().openExitConfirmation()).toBe(false);
    expect(useExitsStore.getState().step).toBe('setup');
    expect(useExitsStore.getState().error).toContain('ya está completa');
  });

  it('cambiar orden conserva el destino y limpia la observación anterior', () => {
    useExitsStore.setState({ step: 'setup', deliveryObservations: 'Observación anterior' });

    useExitsStore.getState().changeDeliveryOrder();

    const state = useExitsStore.getState();
    expect(state.step).toBe('setup');
    expect(state.selectedCustomerId).toBe('customer-1');
    expect(state.deliveryOrders).toEqual([order]);
    expect(state.selectedDeliveryOrderId).toBeNull();
    expect(state.deliveryObservations).toBe('');
  });

  it('regresa del escaneo a la configuración conservando la orden y la observación', () => {
    useExitsStore.setState({ step: 'scanning', deliveryObservations: 'Recibe portería' });

    useExitsStore.getState().goBackToSetup();

    const state = useExitsStore.getState();
    expect(state.step).toBe('setup');
    expect(state.selectedDeliveryOrderId).toBe(order.id);
    expect(state.deliveryObservations).toBe('Recibe portería');
  });

  it('devuelve un resultado tipado y conserva el producto cuando la cantidad es inválida', async () => {
    const product = {
      id: 'product-1',
      name: 'Producto 1',
      sku: 'P-1',
      barcode: '123',
    } as ExitItem['product'];
    useExitsStore.setState({
      warehouseId: 'warehouse-1',
      targetOrderItemId: 'item-1',
      currentProduct: product,
      currentScannedBarcode: '123',
    });

    const result = await useExitsStore.getState().addProductToExit(product, 0, '123');

    expect(result).toEqual({
      ok: false,
      error: 'La cantidad debe ser un número mayor que cero',
    });
    expect(useExitsStore.getState().currentProduct).toBe(product);
    expect(useExitsStore.getState().exitItems).toHaveLength(0);
  });

  it('agrega un producto y solo entonces limpia la lectura actual', async () => {
    const product = {
      id: 'product-1',
      name: 'Producto 1',
      sku: 'P-1',
      barcode: '123',
    } as ExitItem['product'];
    useExitsStore.setState({
      warehouseId: 'warehouse-1',
      targetOrderItemId: 'item-1',
      currentProduct: product,
      currentScannedBarcode: '123',
    });

    const result = await useExitsStore.getState().addProductToExit(product, 2, '123');

    expect(result).toEqual({ ok: true, error: null });
    expect(useExitsStore.getState().exitItems).toEqual([
      expect.objectContaining({ product, quantity: 2, warehouseId: 'warehouse-1' }),
    ]);
    expect(useExitsStore.getState().currentProduct).toBeNull();
    expect(useExitsStore.getState().scannedItemsProgress.get('product-1-warehouse-1::own')).toBe(2);
  });
});

describe('finalizeExit: registro por grupos (remisión mixta)', () => {
  const rpcItems = (items: ExitItem[]) =>
    items.map((item) => ({
      product_id: item.product.id,
      warehouse_id: item.warehouseId,
      quantity: item.quantity,
      barcode_scanned: item.barcode,
      serials: (item.serials ?? []).map((serial) => ({ serial: serial.serial, method: serial.method })),
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    useExitsStore.getState().resetAll();
    useExitsStore.setState({
      step: 'scanning',
      exitMode: 'direct_user',
      selectedUserId: 'user-2',
      selectedDeliveryOrderId: order.id,
      selectedDeliveryOrder: { ...order, order_type: 'remission' },
      canRegisterExit: true,
      authorizationCheckedOrderId: order.id,
      deliveryObservations: '  Recibe portería ',
      registeredExitsCache: { [order.id]: {} },
    });
    mockFrom.mockImplementation(() => chain());
    // Refresco tras registrar: RPC de ítems autorizado vacío → sin caché nueva, la salida sigue siendo éxito.
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'register_inventory_exits_batch') return { data: { exit_ids: ['e-1', 'e-2'] }, error: null };
      if (fn === 'register_remission_exits_batch') {
        return { data: { groups: [{ delivery_order_id: 'order-1', exit_ids: ['e-1'] }, { delivery_order_id: 'child-1', exit_ids: ['e-2'] }] }, error: null };
      }
      return { data: [], error: null };
    });
  });

  it('todos los productos propios → register_inventory_exits_batch como hasta ahora', async () => {
    useExitsStore.setState({ exitItems: [ownItem, { ...ownItem, product: { ...product, id: 'product-3' } as ExitItem['product'], quantity: 1 }] });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('register_inventory_exits_batch', expect.objectContaining({ p_delivery_order_id: 'order-1' }));
    expect(mockRpc).not.toHaveBeenCalledWith('register_remission_exits_batch', expect.anything());
  });

  it('propios + OE hija → register_remission_exits_batch con un grupo por orden objetivo', async () => {
    useExitsStore.setState({ exitItems: [ownItem, childItem] });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('register_remission_exits_batch', {
      p_remission_id: 'order-1',
      p_groups: [
        { delivery_order_id: 'order-1', items: rpcItems([ownItem]) },
        { delivery_order_id: 'child-1', items: rpcItems([childItem]) },
      ],
      p_delivery_observations: 'Recibe portería',
      p_idempotency_key: expect.any(String),
    });
    expect(mockRpc).not.toHaveBeenCalledWith('register_inventory_exits_batch', expect.anything());
    expect(result.ok && result.summary.orderCompleted).toBe(false);
    expect(useExitsStore.getState().loading).toBe(false);
  });

  it('solo productos de una OE hija → también register_remission_exits_batch (un solo grupo, la hija)', async () => {
    useExitsStore.setState({ exitItems: [childItem] });
    mockRpc.mockImplementation(async (fn: string) =>
      fn === 'register_remission_exits_batch'
        ? { data: { groups: [{ delivery_order_id: 'child-1', exit_ids: ['e-2'] }] }, error: null }
        : { data: [], error: null }
    );

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('register_remission_exits_batch', expect.objectContaining({
      p_groups: [{ delivery_order_id: 'child-1', items: rpcItems([childItem]) }],
    }));
  });

  it('una respuesta con menos exit_ids que productos se rechaza y el reintento reutiliza la clave', async () => {
    useExitsStore.setState({ exitItems: [ownItem, childItem] });
    mockRpc.mockImplementation(async (fn: string) =>
      fn === 'register_remission_exits_batch'
        ? { data: { groups: [{ delivery_order_id: 'order-1', exit_ids: ['e-1'] }] }, error: null }
        : { data: [], error: null }
    );

    const first = await useExitsStore.getState().finalizeExit();
    expect(first).toEqual({ ok: false, error: { message: 'La respuesta del registro de salidas está incompleta. Intente nuevamente.' }, summary: null });
    expect(useExitsStore.getState().loading).toBe(false);

    await useExitsStore.getState().finalizeExit();
    const keys = mockRpc.mock.calls
      .filter(([fn]) => fn === 'register_remission_exits_batch')
      .map(([, args]) => (args as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);

    // Cambiar la orden objetivo de un producto es otra petición: clave nueva.
    useExitsStore.setState({ exitItems: [ownItem, { ...childItem, groupKey: 'own', targetOrderId: 'order-1' }] });
    await useExitsStore.getState().finalizeExit();
    const lastKey = (mockRpc.mock.calls.at(-1)?.[1] as { p_idempotency_key: string }).p_idempotency_key;
    expect(lastKey).not.toBe(keys[0]);
  });

  it('tras registrar refresca la caché con un slot por orden objetivo', async () => {
    useExitsStore.setState({ exitItems: [ownItem, childItem] });
    const authorizedRow = (id: string, productId: string, source: string | null, delivered: number) => ({
      id, product_id: productId, warehouse_id: 'warehouse-1', quantity: 2, delivered_quantity: delivered,
      created_at: '2026-08-21T10:00:00.000Z', source_delivery_order_id: source, source_order_number: source ? 'OE-1' : null,
      source_customer_name: source ? 'Cliente' : null, source_order_status: null,
      product_name: 'P', product_barcode: '1', product_sku: 'S', warehouse_name: 'Principal',
    });
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'register_remission_exits_batch') {
        return { data: { groups: [{ delivery_order_id: 'order-1', exit_ids: ['e-1'] }, { delivery_order_id: 'child-1', exit_ids: ['e-2'] }] }, error: null };
      }
      if (fn === 'get_authorized_delivery_order_items') {
        return { data: [authorizedRow('own-1', 'product-1', null, 2), authorizedRow('copy-1', 'product-2', 'child-1', 2)], error: null };
      }
      return { data: [], error: null };
    });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok && result.summary.orderCompleted).toBe(true);
    expect(useExitsStore.getState().registeredExitsCache).toEqual({
      'order-1': { 'product-1-warehouse-1': 2 },
      'child-1': { 'product-2-warehouse-1': 2 },
    });
  });
});
