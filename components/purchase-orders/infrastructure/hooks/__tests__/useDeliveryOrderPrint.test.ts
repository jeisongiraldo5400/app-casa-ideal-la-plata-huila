import { act, renderHook } from '@testing-library/react-native';
import { offersClientSheets, useDeliveryOrderPrint } from '../useDeliveryOrderPrint';

const mockPrintToFile = jest.fn(async (_options: { html: string }) => ({ uri: 'file:///orden.pdf' }));
const mockSharePdf = jest.fn(async (_input: unknown) => 'share-sheet');
const mockRpc = jest.fn();

jest.mock('expo-print', () => ({
  printToFileAsync: (options: { html: string }) => mockPrintToFile(options),
  printAsync: jest.fn(),
}));
jest.mock('@/lib/sharing/sharePdf', () => ({ sharePdf: (input: unknown) => mockSharePdf(input) }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: { getState: () => ({ online: true }) },
}));

const child = (status: string) => ({ status }) as never;

const orderRow = (status: string) => ({
  id: 'o1',
  order_number: 'OE-2026-1',
  order_type: 'customer',
  status,
  created_at: '2026-10-20T14:00:00Z',
  items: [{ product_name: 'Colchón doble', quantity: 1, delivered: 0, returned: 0, pending: 1 }],
});

describe('offersClientSheets', () => {
  it('solo en remisiones con al menos un cliente no anulado', () => {
    expect(offersClientSheets({ orderType: 'remission', children: [child('approved')] })).toBe(true);
    expect(offersClientSheets({ orderType: 'remission', children: [child('cancelled')] })).toBe(false);
    expect(offersClientSheets({ orderType: 'remission', children: [] })).toBe(false);
    expect(offersClientSheets({ orderType: 'customer', children: [child('approved')] })).toBe(false);
  });
});

describe('useDeliveryOrderPrint', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockPrintToFile.mockClear();
    mockSharePdf.mockClear();
  });

  it('compartir el PDF de la orden no registra copia y sale sin marca de copia', async () => {
    mockRpc.mockResolvedValue({ data: orderRow('approved'), error: null });
    const { result } = renderHook(() => useDeliveryOrderPrint());
    await act(() => result.current.printOrder('o1'));
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_delivery_order_print_data', { p_delivery_order_id: 'o1' });
    expect(mockRpc).not.toHaveBeenCalledWith('register_delivery_order_print', expect.anything());
    const html = mockPrintToFile.mock.calls[0][0].html;
    expect(html).not.toContain('COPIA');
    expect(mockSharePdf).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///orden.pdf', dialogTitle: 'OE-2026-1' }));
  });

  it('una orden anulada sigue saliendo con la marca ANULADA', async () => {
    mockRpc.mockResolvedValue({ data: orderRow('cancelled'), error: null });
    const { result } = renderHook(() => useDeliveryOrderPrint());
    await act(() => result.current.printOrder('o1'));
    const html = mockPrintToFile.mock.calls[0][0].html;
    expect(html).toContain('ORDEN ANULADA');
    expect(html).not.toContain('COPIA');
  });
});
