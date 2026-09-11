import { buildNegocioReceiptHtml } from '../negocioReceiptHtml';

const sample = {
  receiptNumber: 'RV-2026-1',
  status: 'emitido',
  paidAt: '2026-08-22T02:35:00.000Z',
  amount: 100_000,
  negocioNumero: 2026001,
  customerName: 'Cliente',
  remainingBalance: 500_000,
};

describe('buildNegocioReceiptHtml', () => {
  it('incluye la fecha y hora del pago en Colombia', () => {
    const html = buildNegocioReceiptHtml(sample);

    expect(html).toContain('Fecha y hora de pago');
    expect(html).toContain('21/08/2026 9:35 p. m.');
  });

  it('lleva logo, NIT, estado y los datos del pago', () => {
    const html = buildNegocioReceiptHtml({
      ...sample,
      paymentMethodName: 'Nequi',
      paymentSiteName: 'Aplicación Móvil',
      registeredBy: 'Gestor Pérez',
    });

    expect(html).toContain('src="data:image/');
    expect(html).toContain('NIT 12.279.584-1');
    expect(html).toContain('<span class="status status-ok">Emitido</span>');
    expect(html).toContain('<span>Método de pago</span><strong>Nequi</strong>');
    expect(html).toContain('<span>Sitio de pago</span><strong>Aplicación Móvil</strong>');
    expect(html).toContain('<span>Registrado por</span><strong>Gestor Pérez</strong>');
    expect(html).toContain('Saldo pendiente');
  });

  it('marca el recibo anulado con sello y aviso', () => {
    const html = buildNegocioReceiptHtml({ ...sample, status: 'anulado' });

    expect(html).toContain('class="receipt is-voided"');
    expect(html).toContain('RECIBO ANULADO');
    expect(html).toContain('<span class="status status-void">Anulado</span>');
  });
});
