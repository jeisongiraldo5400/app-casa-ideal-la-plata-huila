import { act, renderHook } from '@testing-library/react-native';
import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';

const mockPrintToFile = jest.fn(async (_options: { html: string }) => ({ uri: 'file:///recibo.pdf' }));
const mockPrintPayment = jest.fn(async (_data: NegocioReceiptData, _options?: unknown) => undefined);
const mockFetchProducts = jest.fn();
const mockFetchTotalCredit = jest.fn();

jest.mock('expo-print', () => ({ printToFileAsync: (options: { html: string }) => mockPrintToFile(options) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: jest.fn() }));
jest.mock('@/components/printing', () => ({
  useBluetoothPrinter: () => ({ printPayment: mockPrintPayment, printing: false }),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({ openPagoSupport: jest.fn() }));
jest.mock('@/components/negocios/infrastructure/services/negocioPrintService', () => ({
  recordNegocioPrint: jest.fn(async () => null),
}));
jest.mock('@/components/negocios/infrastructure/services/negocioProductLinesService', () => ({
  fetchNegocioReceiptProducts: (id: string) => mockFetchProducts(id),
  fetchNegocioReceiptTotalCredit: (id: string) => mockFetchTotalCredit(id),
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
    mockPrintPayment.mockClear();
    mockFetchProducts.mockReset().mockResolvedValue([{ quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 }]);
    mockFetchTotalCredit.mockReset().mockResolvedValue(null);
  });

  it('el PDF del recibo lleva los productos del negocio del cobro', async () => {
    const { result } = renderHook(() => useCobroReceiptActions());
    await act(() => result.current.shareReceipt(data, target));
    expect(mockFetchProducts).toHaveBeenCalledWith('n1');
    const html = mockPrintToFile.mock.calls[0][0].html;
    expect(html).toContain('<li><span class="pq">2</span><span class="pn">Colchón doble</span>');
    expect(html).toContain('<span>Total productos</span>');
  });

  it('el ticket por Bluetooth también recibe los productos', async () => {
    const { result } = renderHook(() => useCobroReceiptActions());
    await act(() => result.current.printReceipt(data, target));
    expect(mockPrintPayment.mock.calls[0][0].products).toEqual([
      { quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 },
    ]);
  });

  it('con interés el recibo muestra «Interés» y «Total» del negocio (PDF y ticket)', async () => {
    mockFetchTotalCredit.mockResolvedValue(1500000);
    const { result } = renderHook(() => useCobroReceiptActions());
    await act(() => result.current.shareReceipt(data, target));
    expect(mockFetchTotalCredit).toHaveBeenCalledWith('n1');
    const html = mockPrintToFile.mock.calls[0][0].html;
    expect(html).toContain('<span>Interés</span>');
    expect(html).toContain('<span>Total</span>');

    await act(() => result.current.printReceipt(data, target));
    expect(mockPrintPayment.mock.calls[0][0].totalCredit).toBe(1500000);
  });
});
