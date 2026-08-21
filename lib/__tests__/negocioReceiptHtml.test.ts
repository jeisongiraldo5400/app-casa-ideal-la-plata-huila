import { buildNegocioReceiptHtml } from '../negocioReceiptHtml';

describe('buildNegocioReceiptHtml', () => {
  it('incluye la fecha y hora del pago en Colombia', () => {
    const html = buildNegocioReceiptHtml({
      receiptNumber: 'RV-2026-1',
      status: 'emitido',
      paidAt: '2026-08-22T02:35:00.000Z',
      amount: 100_000,
      negocioNumero: 2026001,
      customerName: 'Cliente',
      remainingBalance: 500_000,
    });

    expect(html).toContain('Fecha y hora de pago');
    expect(html).toContain('21/08/2026 21:35');
  });
});
