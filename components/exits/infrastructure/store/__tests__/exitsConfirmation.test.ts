import { useExitsStore, type DeliveryOrder, type ExitItem } from '../exitsStore';

jest.mock('@/lib/supabase', () => ({
  supabase: {},
}));

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
    },
  ],
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
    expect(useExitsStore.getState().scannedItemsProgress.get('product-1-warehouse-1')).toBe(2);
  });
});
