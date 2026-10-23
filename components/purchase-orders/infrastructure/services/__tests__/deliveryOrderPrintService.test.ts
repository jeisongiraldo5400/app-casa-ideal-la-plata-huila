import {
  DELIVERY_ORDER_PRINT_OFFLINE_MESSAGE,
  DeliveryOrderPrintOfflineError,
  fetchDeliveryOrderPrintData,
} from '../deliveryOrderPrintService';

const mockRpc = jest.fn();
let mockOnline = true;

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: { getState: () => ({ online: mockOnline }) },
}));

describe('deliveryOrderPrintService', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockOnline = true;
  });

  it('sin señal no consulta: avisa que necesita conexión', async () => {
    mockOnline = false;
    await expect(fetchDeliveryOrderPrintData('o1')).rejects.toBeInstanceOf(DeliveryOrderPrintOfflineError);
    await expect(fetchDeliveryOrderPrintData('o1')).rejects.toThrow(DELIVERY_ORDER_PRINT_OFFLINE_MESSAGE);
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

  it('un error del servidor sube con su mensaje', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'La orden de entrega no existe' } });
    await expect(fetchDeliveryOrderPrintData('o1')).rejects.toThrow('La orden de entrega no existe');
  });
});
