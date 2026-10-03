import { act, renderHook } from '@testing-library/react-native';
import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';

const mockPrintToFile = jest.fn(async (_options: { html: string }) => ({ uri: 'file:///recibo.pdf' }));
const mockPrintPayment = jest.fn(async (_data: NegocioReceiptData, _options?: unknown) => undefined);
const mockFetchProducts = jest.fn();

jest.mock('expo-print', () => ({ printToFileAsync: (options: { html: string }) => mockPrintToFile(options) }));
const mockSharePdf = jest.fn(async (_input: unknown) => 'whatsapp');
jest.mock('@/lib/sharing/sharePdfToWhatsApp', () => ({
  ...jest.requireActual('@/lib/sharing/sharePdfToWhatsApp'),
  sharePdfToWhatsApp: (input: unknown) => mockSharePdf(input),
}));
jest.mock('@/components/negocios/infrastructure/services/negocioCustomerPhonesService', () => ({
  fetchNegocioCustomerPhones: async () => ({ phone: '300 123 4567', phoneSecondary: null }),
}));
jest.mock('@/components/printing', () => ({
  useBluetoothPrinter: () => ({ printPayment: mockPrintPayment, printing: false }),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({ openPagoSupport: jest.fn() }));
jest.mock('@/components/negocios/infrastructure/services/negocioPrintService', () => ({
  recordNegocioPrint: jest.fn(async () => null),
}));
jest.mock('@/components/negocios/infrastructure/services/negocioProductLinesService', () => ({
  fetchNegocioReceiptProducts: (id: string) => mockFetchProducts(id),
}));

import { useCobroReceiptActions } from '../useCobroReceiptActions';

const data: NegocioReceiptData = {
  receiptNumber: 'RV-1',
  status: 'emitido',
  paidAt: '2026-09-28T14:00:00Z',
  amount: 100000,
  negocioNumero: 20260001,
  customerName: 'Cliente Uno',
  remainingBalance: 900000,
};
const target = { negocio_id: 'n1', payment_id: 'p1' };

describe('useCobroReceiptActions', () => {
  beforeEach(() => {
    mockPrintToFile.mockClear();
    mockSharePdf.mockClear();
    mockPrintPayment.mockClear();
    mockFetchProducts.mockReset().mockResolvedValue([{ quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 }]);
  });

  it('el PDF del recibo lleva los productos del negocio del cobro', async () => {
    const { result } = renderHook(() => useCobroReceiptActions());
    await act(() => result.current.shareReceipt(data, target));
    expect(mockFetchProducts).toHaveBeenCalledWith('n1');
    const html = mockPrintToFile.mock.calls[0][0].html;
    expect(html).toContain('<li><span class="pq">2</span><span class="pn">Colchón doble</span>');
    expect(html).toContain('<span>Total productos</span>');
  });

  it('envía el PDF al WhatsApp del cliente con nombre claro', async () => {
    const { result } = renderHook(() => useCobroReceiptActions());
    await act(() => result.current.shareReceipt(data, target));
    expect(mockSharePdf).toHaveBeenCalledWith({
      uri: 'file:///recibo.pdf',
      fileName: 'Recibo RV-1 - Cliente Uno.pdf',
      phone: '300 123 4567',
      phoneSecondary: null,
      dialogTitle: 'RV-1',
    });
  });

  it('el ticket por Bluetooth también recibe los productos', async () => {
    const { result } = renderHook(() => useCobroReceiptActions());
    await act(() => result.current.printReceipt(data, target));
    expect(mockPrintPayment.mock.calls[0][0].products).toEqual([
      { quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 },
    ]);
  });
});
