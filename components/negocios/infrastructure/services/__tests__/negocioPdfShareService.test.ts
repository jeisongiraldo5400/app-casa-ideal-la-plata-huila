import { shareNegocioContractPdf, shareNegocioReceiptPdf } from '../negocioPdfShareService';

const mockPrintToFile = jest.fn(async (_options: { html: string }) => ({ uri: 'file:///doc.pdf' }));
const mockSharePdf = jest.fn(async (_input: unknown) => 'share-sheet');
const mockRpc = jest.fn();
const mockQueue = jest.fn();

jest.mock('expo-print', () => ({ printToFileAsync: (options: { html: string }) => mockPrintToFile(options) }));
jest.mock('@/lib/sharing/sharePdf', () => ({
  ...jest.requireActual('@/lib/sharing/sharePdf'),
  sharePdf: (input: unknown) => mockSharePdf(input),
}));
// Si algo intentara registrar la copia, pasaría por aquí.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  queuePrintOffline: (...args: unknown[]) => mockQueue(...args),
  findPendingPagoCommand: jest.fn(async () => null),
}));

const contract = {
  numero: 20260007,
  deal_date: '2026-10-01',
  status: 'activo',
  customer_name: 'Cliente Uno',
  products_subtotal: 1000000,
  interest_amount: 0,
  total_credit: 1000000,
  down_payment: 100000,
  financed_amount: 900000,
  installments_count: 3,
  installment_amount: 300000,
  frequency: 'mensual',
  items: [{ quantity: 1, description: 'Colchón doble', unit_price: 1000000, subtotal: 1000000 }],
  cuotas: [],
};

const receipt = {
  receiptNumber: 'RV-1',
  status: 'emitido',
  paidAt: '2026-10-20T14:00:00Z',
  amount: 100000,
  negocioNumero: 20260007,
  customerName: 'Cliente Uno',
  remainingBalance: 800000,
};

describe('negocioPdfShareService', () => {
  beforeEach(() => {
    mockPrintToFile.mockClear();
    mockSharePdf.mockClear();
    mockRpc.mockClear();
    mockQueue.mockClear();
  });

  it('compartir el contrato no registra copia (ni RPC ni cola) y el PDF va sin marca', async () => {
    await shareNegocioContractPdf(contract as never);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockQueue).not.toHaveBeenCalled();
    const html = mockPrintToFile.mock.calls[0][0].html;
    expect(html).not.toContain('COPIA');
    expect(mockSharePdf).toHaveBeenCalledWith(expect.objectContaining({ fileName: expect.stringContaining('Cliente Uno') }));
  });

  it('aunque le llegue un número de copia, el contrato compartido sale sin marca', async () => {
    await shareNegocioContractPdf({ ...contract, copy: { number: 5, printedAt: 't' } } as never);
    expect(mockPrintToFile.mock.calls[0][0].html).not.toContain('COPIA');
  });

  it('compartir el recibo no registra copia (ni RPC ni cola) y el PDF va sin marca', async () => {
    await shareNegocioReceiptPdf(receipt);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockQueue).not.toHaveBeenCalled();
    expect(mockPrintToFile.mock.calls[0][0].html).not.toContain('COPIA');
    expect(mockSharePdf).toHaveBeenCalledWith({
      uri: 'file:///doc.pdf',
      fileName: 'Recibo RV-1 - Cliente Uno.pdf',
      dialogTitle: 'RV-1',
    });
  });

  it('un recibo anulado sigue saliendo como ANULADO', async () => {
    await shareNegocioReceiptPdf({ ...receipt, status: 'anulado' });
    expect(mockPrintToFile.mock.calls[0][0].html).toContain('RECIBO ANULADO');
  });
});
