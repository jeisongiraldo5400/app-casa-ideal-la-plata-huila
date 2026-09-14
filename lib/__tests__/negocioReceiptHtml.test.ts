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

  describe('pronto pago', () => {
    const prontoPago = {
      ...sample,
      amount: 900_000,
      remainingBalance: 0,
      paymentKind: 'pronto_pago',
      discountAmount: 100_000,
      discountReason: 'Cliente <paga> todo',
      expectedTotal: 1_000_000,
    };

    it('muestra total pendiente, descuento, total pagado, saldo $0 y la leyenda', () => {
      const html = buildNegocioReceiptHtml(prontoPago);

      expect(html).toContain('Recibo de pago · Pronto pago');
      expect(html).toContain('<section class="amount"><span>Total pagado</span><strong>$\u00a0900.000</strong>');
      expect(html).toContain('<span>Total pendiente</span><strong>$\u00a01.000.000</strong>');
      expect(html).toContain('<span>Descuento pronto pago</span><strong>$\u00a0100.000</strong>');
      expect(html).toContain('<section class="balance"><span>Saldo pendiente</span><strong>$\u00a00</strong>');
      expect(html).toContain('Crédito cancelado por pronto pago.');
      // El motivo se escapa.
      expect(html).toContain('<span>Motivo del descuento</span><strong>Cliente &lt;paga&gt; todo</strong>');
    });

    it('sin motivo omite la fila «Motivo del descuento»', () => {
      for (const discountReason of [null, undefined, '', '   ']) {
        const html = buildNegocioReceiptHtml({ ...prontoPago, discountReason });
        expect(html).toContain('<span>Descuento pronto pago</span>');
        expect(html).not.toContain('Motivo del descuento');
      }
    });

    it('el saldo del recibo de un pronto pago siempre es $0', () => {
      const html = buildNegocioReceiptHtml({ ...prontoPago, remainingBalance: 5_000 });
      expect(html).toContain('<section class="balance"><span>Saldo pendiente</span><strong>$\u00a00</strong>');
    });

    it('no agrega CSS nuevo (paridad con el recibo web)', () => {
      const abono = buildNegocioReceiptHtml(sample);
      const pronto = buildNegocioReceiptHtml(prontoPago);
      const css = (html: string) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
      expect(css(pronto)).toBe(css(abono));
    });

    it('anulado no dice que el crédito quedó cancelado', () => {
      const html = buildNegocioReceiptHtml({ ...prontoPago, status: 'anulado' });
      expect(html).toContain('RECIBO ANULADO');
      expect(html).not.toContain('Crédito cancelado por pronto pago');
    });

    it('un abono no cambia: «Valor recibido» y sin descuento', () => {
      const html = buildNegocioReceiptHtml({ ...sample, paymentKind: 'abono', discountAmount: 0 });
      expect(html).toContain('<span>Valor recibido</span>');
      expect(html).not.toContain('Descuento pronto pago');
      expect(html).not.toContain('Pronto pago');
    });
  });
});
