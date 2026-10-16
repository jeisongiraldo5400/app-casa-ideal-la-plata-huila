import {
  DELIVERY_ORDER_PRINT_OFFLINE_MESSAGE,
  DeliveryOrderPrintOfflineError,
  fetchDeliveryOrderPrintData,
  parseDeliveryOrderPrintRegistration,
  registerDeliveryOrderPrint,
} from '../deliveryOrderPrintService';

const mockRpc = jest.fn();
let mockOnline = true;

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: { getState: () => ({ online: mockOnline }) },
}));
jest.mock('@/lib/idempotency', () => ({ createIdempotencyKey: () => 'evt-1' }));

describe('deliveryOrderPrintService', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockOnline = true;
  });

  it('sin señal no consulta ni registra: avisa que necesita conexión', async () => {
    mockOnline = false;
    await expect(fetchDeliveryOrderPrintData('o1')).rejects.toBeInstanceOf(DeliveryOrderPrintOfflineError);
    await expect(registerDeliveryOrderPrint('o1', 'completa')).rejects.toThrow(DELIVERY_ORDER_PRINT_OFFLINE_MESSAGE);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('un fallo de red se informa como falta de conexión', async () => {
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    await expect(fetchDeliveryOrderPrintData('o1')).rejects.toBeInstanceOf(DeliveryOrderPrintOfflineError);
  });

  it('lee los datos de la orden', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'o1', order_number: 'OE-1', order_type: 'customer', status: 'approved', items: [] }, error: null });
    const data = await fetchDeliveryOrderPrintData('o1');
    expect(mockRpc).toHaveBeenCalledWith('get_delivery_order_print_data', { p_delivery_order_id: 'o1' });
    expect(data.orderNumber).toBe('OE-1');
  });

  it('registra por el canal móvil con id de evento y devuelve la copia', async () => {
    mockRpc.mockResolvedValue({
      data: { printed_at: 't', printed_by_name: 'Ana', copy_number: 3, copies: [{ delivery_order_id: 'o1', copy_number: 3 }] },
      error: null,
    });
    const result = await registerDeliveryOrderPrint('o1', 'completa');
    expect(mockRpc).toHaveBeenCalledWith('register_delivery_order_print', {
      p_delivery_order_id: 'o1',
      p_channel: 'movil',
      p_layout: 'completa',
      p_format: 'pdf',
      p_client_event_id: 'evt-1',
    });
    expect(result.copy).toEqual({ number: 3, printedAt: 't', printedBy: 'Ana' });
  });

  it('un error del servidor sube con su mensaje', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'La orden de entrega no existe' } });
    await expect(registerDeliveryOrderPrint('o1', 'completa')).rejects.toThrow('La orden de entrega no existe');
  });

  it('hoja por cliente: una copia por orden y sin copia del documento completo', () => {
    const result = parseDeliveryOrderPrintRegistration({
      printed_at: 't',
      copy_number: null,
      copies: [{ delivery_order_id: 'o1', copy_number: 4 }, { delivery_order_id: 'o2', copy_number: 1 }],
    });
    expect(result.copy).toBeNull();
    expect(result.copiesByOrderId.o1.number).toBe(4);
    expect(() => parseDeliveryOrderPrintRegistration({})).toThrow('número de copia');
  });
});
