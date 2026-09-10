import { getOrCreatePersistentIdempotencyKey } from '@/lib/idempotency';
import { useEntriesStore, type EntryItem } from '../entriesStore';

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
  fetchSuppliers: jest.fn(async () => []),
  fetchWarehouses: jest.fn(async () => []),
}));

jest.mock('../../services/entriesQueries', () => ({
  EntryValidationQueryError: class EntryValidationQueryError extends Error {
    step = 'warehouse';
  },
  fetchEntryValidationData: jest.fn(async () => ({
    warehouse: { id: 'warehouse-1', is_active: true, deleted_at: null },
    products: [{ id: 'product-1', deleted_at: null }],
    orderStatus: undefined,
  })),
  fetchInventoryEntriesForOrders: jest.fn(async () => []),
  fetchPurchaseOrderDetail: jest.fn(async () => null),
}));

const product = { id: 'product-1', name: 'Nevera 300L', sku: 'NEV-300', barcode: '770123' } as EntryItem['product'];

const available = { data: { available: true, serial_normalized: 'X' }, error: null };

function seedReview(quantity = 2) {
  useEntriesStore.getState().resetAll();
  useEntriesStore.setState({
    entryType: 'ENTRY',
    warehouseId: 'warehouse-1',
    step: 'scanning',
    uiStage: 'product_review',
    currentProduct: product,
    currentScannedBarcode: '770123',
    currentQuantity: quantity,
  });
}

describe('seriales opcionales en entradas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue(available);
  });

  it('normaliza el serial, lo verifica en el servidor y lo agrega a la ficha', async () => {
    seedReview();

    const result = await useEntriesStore.getState().addCurrentSerial(' ab-12 3 ', 'manual');

    expect(result).toEqual({ ok: true, error: null });
    expect(mockRpc).toHaveBeenCalledWith('check_entry_serial', { p_product_id: 'product-1', p_serial: 'ab-12 3' });
    expect(useEntriesStore.getState().currentSerials).toEqual([{ serial: 'ab-12 3', normalized: 'AB123', method: 'manual' }]);
    expect(useEntriesStore.getState().serialChecking).toBe(false);
  });

  it('rechaza un serial sin letras ni números sin consultar al servidor', async () => {
    seedReview();

    const result = await useEntriesStore.getState().addCurrentSerial(' -- / ', 'manual');

    expect(result).toEqual({ ok: false, error: 'Escribe o escanea un serial válido' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rechaza un serial de más de 100 caracteres', async () => {
    seedReview();

    const result = await useEntriesStore.getState().addCurrentSerial('A'.repeat(101), 'manual');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('100 caracteres');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('no deja más seriales que unidades', async () => {
    seedReview(1);
    await useEntriesStore.getState().addCurrentSerial('AAA1', 'scan');

    const result = await useEntriesStore.getState().addCurrentSerial('BBB2', 'scan');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Ya hay un serial por cada unidad');
    expect(useEntriesStore.getState().currentSerials).toHaveLength(1);
  });

  it('rechaza un serial repetido en la ficha sin consultar otra vez al servidor', async () => {
    seedReview();
    await useEntriesStore.getState().addCurrentSerial('AB123', 'scan');

    const result = await useEntriesStore.getState().addCurrentSerial('ab 123', 'manual');

    expect(result).toEqual({ ok: false, error: 'Este serial ya está en esta entrada' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('rechaza un serial que ya está en otra línea del mismo producto', async () => {
    seedReview();
    useEntriesStore.setState({
      entryItems: [{ product, quantity: 1, barcode: '770123', serials: [{ serial: 'AB123', normalized: 'AB123', method: 'scan' }] }],
    });

    const result = await useEntriesStore.getState().addCurrentSerial('AB-123', 'manual');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('muestra el mensaje del servidor cuando el serial ya está en una bodega', async () => {
    seedReview();
    const message = 'El serial AB123 ya está en la bodega Principal desde el 01/09/2026.';
    mockRpc.mockResolvedValue({ data: { available: false, message }, error: null });

    const result = await useEntriesStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result).toEqual({ ok: false, error: message });
    expect(useEntriesStore.getState().currentSerials).toEqual([]);
    expect(useEntriesStore.getState().serialChecking).toBe(false);
  });

  it('si la verificación falla por red agrega el serial: el registro lo valida al final', async () => {
    seedReview();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed', code: '' } });

    const result = await useEntriesStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result.ok).toBe(true);
    expect(useEntriesStore.getState().currentSerials).toHaveLength(1);
  });

  it('sin la migración en el servidor no captura seriales', async () => {
    seedReview();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function', code: 'PGRST202' } });

    const result = await useEntriesStore.getState().addCurrentSerial('AB123', 'scan');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('aún no está habilitado');
  });

  it('descarta la respuesta si la ficha se reinició mientras se verificaba', async () => {
    seedReview();
    let resolveCheck: (value: unknown) => void = () => undefined;
    mockRpc.mockImplementation(() => new Promise((resolve) => { resolveCheck = resolve; }));

    const pending = useEntriesStore.getState().addCurrentSerial('AB123', 'scan');
    useEntriesStore.getState().resetAll();
    resolveCheck(available);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(useEntriesStore.getState().currentSerials).toEqual([]);
    expect(useEntriesStore.getState().serialChecking).toBe(false);
  });

  it('al agregar el producto lleva los seriales a la línea y limpia la ficha', async () => {
    seedReview();
    await useEntriesStore.getState().addCurrentSerial('AB123', 'scan');

    const result = await useEntriesStore.getState().addProductToEntry(product, 2, '770123');

    expect(result.ok).toBe(true);
    const state = useEntriesStore.getState();
    expect(state.entryItems[0].serials).toEqual([{ serial: 'AB123', normalized: 'AB123', method: 'scan' }]);
    expect(state.currentSerials).toEqual([]);
  });

  it('suma los seriales a la línea existente del mismo producto', async () => {
    seedReview();
    useEntriesStore.setState({
      entryItems: [{ product, quantity: 1, barcode: '770123', serials: [{ serial: 'A1', normalized: 'A1', method: 'scan' }] }],
    });
    await useEntriesStore.getState().addCurrentSerial('B2', 'manual');

    await useEntriesStore.getState().addProductToEntry(product, 1, '770123');

    const line = useEntriesStore.getState().entryItems[0];
    expect(line.quantity).toBe(2);
    expect(line.serials?.map((serial) => serial.normalized)).toEqual(['A1', 'B2']);
  });

  it('no agrega el producto si hay más seriales que unidades', async () => {
    seedReview();
    useEntriesStore.setState({
      currentSerials: [
        { serial: 'A1', normalized: 'A1', method: 'scan' },
        { serial: 'B2', normalized: 'B2', method: 'scan' },
      ],
    });

    const result = await useEntriesStore.getState().addProductToEntry(product, 1, '770123');

    expect(result.ok).toBe(false);
    expect(useEntriesStore.getState().entryItems).toEqual([]);
  });

  it('no deja bajar la cantidad de una línea por debajo de sus seriales', () => {
    seedReview();
    useEntriesStore.setState({
      entryItems: [{
        product,
        quantity: 2,
        barcode: '770123',
        serials: [
          { serial: 'A1', normalized: 'A1', method: 'scan' },
          { serial: 'B2', normalized: 'B2', method: 'manual' },
        ],
      }],
    });

    useEntriesStore.getState().updateProductQuantity(0, 1);

    expect(useEntriesStore.getState().entryItems[0].quantity).toBe(2);
    expect(useEntriesStore.getState().error).toContain('Quita el producto');
  });

  it('envía los seriales de cada línea al registrar y los incluye en la huella de idempotencia', async () => {
    seedReview();
    useEntriesStore.setState({
      entryItems: [{ product, quantity: 2, barcode: '770123', serials: [{ serial: 'ab-123', normalized: 'AB123', method: 'scan' }] }],
    });
    mockRpc.mockResolvedValue({ data: { entry_ids: ['entry-1'], purchase_order_progress: null }, error: null });

    const result = await useEntriesStore.getState().finalizeEntry('user-1');

    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('register_inventory_entries_batch', expect.objectContaining({
      p_warehouse_id: 'warehouse-1',
      p_idempotency_key: 'persistent-key',
      p_items: [{
        product_id: 'product-1',
        quantity: 2,
        barcode_scanned: '770123',
        serials: [{ serial: 'ab-123', method: 'scan' }],
      }],
    }));
    const fingerprint = (getOrCreatePersistentIdempotencyKey as jest.Mock).mock.calls[0][1] as string;
    expect(fingerprint).toContain('AB123:scan');
  });

  it('muestra el rechazo del servidor al registrar (serial ya en bodega)', async () => {
    seedReview();
    useEntriesStore.setState({
      entryItems: [{ product, quantity: 1, barcode: '770123', serials: [{ serial: 'AB123', normalized: 'AB123', method: 'scan' }] }],
    });
    const message = 'El serial AB123 ya está en la bodega Principal desde el 01/09/2026.';
    mockRpc.mockResolvedValue({ data: null, error: { message, code: 'P0001' } });

    const result = await useEntriesStore.getState().finalizeEntry('user-1');

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe(message);
    expect(useEntriesStore.getState().entryItems).toHaveLength(1);
  });

  it('no registra si una línea quedó con más seriales que unidades', async () => {
    seedReview();
    useEntriesStore.setState({
      entryItems: [{
        product,
        quantity: 1,
        barcode: '770123',
        serials: [
          { serial: 'A1', normalized: 'A1', method: 'scan' },
          { serial: 'B2', normalized: 'B2', method: 'scan' },
        ],
      }],
    });

    const result = await useEntriesStore.getState().finalizeEntry('user-1');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalledWith('register_inventory_entries_batch', expect.anything());
  });

  it('un nuevo escaneo limpia los seriales de la ficha anterior', async () => {
    seedReview();
    useEntriesStore.setState({
      currentSerials: [{ serial: 'A1', normalized: 'A1', method: 'scan' }],
      searchProductByBarcode: jest.fn(async () => product),
    });

    await useEntriesStore.getState().scanBarcode('770123');

    expect(useEntriesStore.getState().currentSerials).toEqual([]);
  });
});
