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

jest.mock('@/components/exits/infrastructure/services/exitsService', () => ({
  fetchActiveProfiles: jest.fn(async () => []),
  searchCustomersByTerm: jest.fn(async () => []),
  fetchWarehouseStock: jest.fn(async () => 10),
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

const product = { id: 'product-1', name: 'Nevera 300L', sku: 'NEV-300', barcode: '770123' } as ExitItem['product'];

const order: DeliveryOrder = {
  id: 'order-1',
  order_number: 'OE-1',
  customer_id: 'customer-1',
  customer_name: 'Cliente prueba',
  customer_id_number: '123',
  status: 'pending',
  delivery_address: null,
  notes: null,
  created_at: '2026-09-10T10:00:00.000Z',
  items: [{
    id: 'item-1',
    product_id: 'product-1',
    product_name: 'Nevera 300L',
    product_barcode: '770123',
    product_sku: 'NEV-300',
    warehouse_id: 'warehouse-1',
    warehouse_name: 'Bodega principal',
    quantity: 5,
    delivered_quantity: 0,
    pending_quantity: 5,
    db_delivered_quantity: 0,
    created_at: '2026-09-10T10:00:00.000Z',
    source_delivery_order_id: null,
    group_key: 'own',
  }],
};

const available = { data: { available: true, serial_normalized: 'X' }, error: null };

function seedReview(quantity = 2) {
  useExitsStore.getState().resetAll();
  useExitsStore.setState({
    step: 'scanning',
    exitMode: 'direct_customer',
    selectedCustomerId: 'customer-1',
    selectedDeliveryOrderId: order.id,
    selectedDeliveryOrder: order,
    registeredExitsCache: { [order.id]: {} },
    canRegisterExit: true,
    authorizationCheckedOrderId: order.id,
    currentProduct: product,
    currentScannedBarcode: '770123',
    currentQuantity: quantity,
    currentAvailableStock: 5,
    currentPhysicalStock: 10,
    warehouseId: 'warehouse-1',
    targetOrderItemId: 'item-1',
  });
}

describe('seriales opcionales en salidas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockImplementation(() => chain());
    mockRpc.mockResolvedValue(available);
  });

  it('normaliza el serial, lo verifica en el servidor y lo agrega a la ficha', async () => {
    seedReview();

    const result = await useExitsStore.getState().addCurrentSerial(' ab-12 3 ', 'manual');

    expect(result).toEqual({ ok: true, error: null });
    expect(mockRpc).toHaveBeenCalledWith('check_exit_serial', {
      p_delivery_order_id: 'order-1',
      p_product_id: 'product-1',
      p_serial: 'ab-12 3',
      p_warehouse_id: 'warehouse-1',
    });
    expect(useExitsStore.getState().currentSerials).toEqual([{ serial: 'ab-12 3', normalized: 'AB123', method: 'manual' }]);
    expect(useExitsStore.getState().serialChecking).toBe(false);
  });

  it('marca el serial como verificado cuando el servidor lo encuentra en las entradas de la bodega', async () => {
    seedReview();
    mockRpc.mockResolvedValue({ data: { available: true, verified: true, serial_normalized: 'AB123' }, error: null });

    await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(useExitsStore.getState().currentSerials).toEqual([
      { serial: 'AB123', normalized: 'AB123', method: 'scan', verified: true },
    ]);
  });

  it('marca el serial como no registrado en entradas cuando el servidor lo permite sin verificar', async () => {
    seedReview();
    mockRpc.mockResolvedValue({ data: { available: true, verified: false, serial_normalized: 'AB123' }, error: null });

    await useExitsStore.getState().addCurrentSerial('AB123', 'manual');

    expect(useExitsStore.getState().currentSerials[0].verified).toBe(false);
  });

  it('rechaza un serial registrado en otra bodega con el mensaje del servidor', async () => {
    seedReview();
    const message = 'El serial AB123 está registrado en la bodega Norte. Despáchalo desde esa bodega o revisa el serial.';
    mockRpc.mockResolvedValue({ data: { available: false, verified: false, message }, error: null });

    const result = await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result).toEqual({ ok: false, error: message });
    expect(useExitsStore.getState().currentSerials).toEqual([]);
  });

  it('si el servidor aún no tiene la verificación por bodega usa la versión sin bodega', async () => {
    seedReview();
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } })
      .mockResolvedValueOnce(available);

    const result = await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'check_exit_serial', {
      p_delivery_order_id: 'order-1',
      p_product_id: 'product-1',
      p_serial: 'AB123',
    });
    expect(useExitsStore.getState().currentSerials[0].verified).toBeUndefined();
  });

  it('pide elegir la bodega antes de capturar seriales', async () => {
    seedReview();
    useExitsStore.setState({ warehouseId: null });

    const result = await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('al cambiar de bodega descarta los seriales capturados (su verificación depende de la bodega)', async () => {
    seedReview();
    useExitsStore.setState({
      currentSerials: [{ serial: 'AB123', normalized: 'AB123', method: 'scan', verified: true }],
      warehouseCandidates: [
        { warehouseId: 'warehouse-1', warehouseName: 'Bodega principal', pending: 5, groupKey: 'own', groupLabel: 'Productos de la orden', targetOrderId: 'order-1' },
        { warehouseId: 'warehouse-2', warehouseName: 'Bodega norte', pending: 5, groupKey: 'own', groupLabel: 'Productos de la orden', targetOrderId: 'order-1' },
      ],
    });

    await useExitsStore.getState().selectScanWarehouse('warehouse-2');

    expect(useExitsStore.getState().warehouseId).toBe('warehouse-2');
    expect(useExitsStore.getState().currentSerials).toEqual([]);
  });

  it('rechaza un serial repetido en la salida sin consultar otra vez al servidor', async () => {
    seedReview();
    await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    const result = await useExitsStore.getState().addCurrentSerial('ab 123', 'manual');

    expect(result).toEqual({ ok: false, error: 'Este serial ya está en esta salida' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('rechaza un serial que ya está en otra línea de la misma salida', async () => {
    seedReview();
    useExitsStore.setState({
      exitItems: [{
        product,
        quantity: 1,
        barcode: '770123',
        warehouseId: 'warehouse-1',
        serials: [{ serial: 'AB123', normalized: 'AB123', method: 'scan' }],
      }],
    });

    const result = await useExitsStore.getState().addCurrentSerial('AB-123', 'manual');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('no deja más seriales que unidades', async () => {
    seedReview(1);
    await useExitsStore.getState().addCurrentSerial('AAA1', 'scan');

    const result = await useExitsStore.getState().addCurrentSerial('BBB2', 'scan');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Ya hay un serial por cada unidad');
    expect(useExitsStore.getState().currentSerials).toHaveLength(1);
  });

  it('muestra el mensaje del servidor cuando el serial ya salió', async () => {
    seedReview();
    const message = 'El serial AB123 ya salió el 01/09/2026 en la orden OE-9. No se puede registrar de nuevo mientras esa salida esté activa.';
    mockRpc.mockResolvedValue({ data: { available: false, message }, error: null });

    const result = await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result).toEqual({ ok: false, error: message });
    expect(useExitsStore.getState().currentSerials).toEqual([]);
    expect(useExitsStore.getState().serialChecking).toBe(false);
  });

  it('si la verificación falla por red agrega el serial: el registro lo valida al final', async () => {
    seedReview();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed', code: '' } });

    const result = await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result.ok).toBe(true);
    expect(useExitsStore.getState().currentSerials).toHaveLength(1);
  });

  it('sin la migración en el servidor no captura seriales', async () => {
    seedReview();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } });

    const result = await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('aún no está habilitado');
    // Primero con bodega; al no existir, intenta la versión sin bodega.
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('al agregar el producto lleva los seriales a la línea y limpia la ficha', async () => {
    seedReview();
    await useExitsStore.getState().addCurrentSerial('AB123', 'scan');

    const result = await useExitsStore.getState().addProductToExit(product, 2, '770123');

    expect(result.ok).toBe(true);
    const state = useExitsStore.getState();
    expect(state.exitItems[0].serials).toEqual([{ serial: 'AB123', normalized: 'AB123', method: 'scan' }]);
    expect(state.currentSerials).toEqual([]);
  });

  it('no agrega el producto si hay más seriales que unidades', async () => {
    seedReview();
    useExitsStore.setState({
      currentSerials: [
        { serial: 'A1', normalized: 'A1', method: 'scan' },
        { serial: 'B2', normalized: 'B2', method: 'scan' },
      ],
    });

    const result = await useExitsStore.getState().addProductToExit(product, 1, '770123');

    expect(result.ok).toBe(false);
    expect(useExitsStore.getState().exitItems).toEqual([]);
  });

  it('no deja bajar la cantidad de una línea por debajo de sus seriales', () => {
    seedReview();
    useExitsStore.setState({
      exitItems: [{
        product,
        quantity: 2,
        barcode: '770123',
        warehouseId: 'warehouse-1',
        availableStock: 3,
        serials: [
          { serial: 'A1', normalized: 'A1', method: 'scan' },
          { serial: 'B2', normalized: 'B2', method: 'manual' },
        ],
      }],
    });

    useExitsStore.getState().updateProductQuantity(0, 1);

    expect(useExitsStore.getState().exitItems[0].quantity).toBe(2);
    expect(useExitsStore.getState().error).toContain('Quita el producto');
  });

  it('envía los seriales de cada línea al registrar la salida', async () => {
    seedReview();
    useExitsStore.setState({
      exitItems: [{
        product,
        quantity: 2,
        barcode: '770123',
        warehouseId: 'warehouse-1',
        availableStock: 3,
        serials: [{ serial: 'ab-123', normalized: 'AB123', method: 'scan' }],
      }],
    });
    mockRpc.mockResolvedValue({ data: { exit_ids: ['exit-1'] }, error: null });

    const result = await useExitsStore.getState().finalizeExit();

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('register_inventory_exits_batch', expect.objectContaining({
      p_items: [expect.objectContaining({
        product_id: 'product-1',
        quantity: 2,
        serials: [{ serial: 'ab-123', method: 'scan' }],
      })],
    }));
  });
});
