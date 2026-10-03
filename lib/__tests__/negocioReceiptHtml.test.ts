import {
  buildNegocioReceiptHtml,
  receiptProductsFromItems,
  PENDING_CONFIRMATION_RECEIPT_LEGEND,
  PENDING_CONFIRMATION_RECEIPT_NOTE,
} from '../negocioReceiptHtml';
import { formatCOP } from '../creditCalculator';

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

  it('muestra la cédula del cliente debajo del nombre y la omite si no hay', () => {
    const html = buildNegocioReceiptHtml({ ...sample, customerIdNumber: '1.061.111' });
    expect(html).toContain(
      '<span>Cliente</span><strong>Cliente</strong></div>\n  <div class="field wide"><span>C.C.</span><strong>1.061.111</strong>'
    );
    expect(buildNegocioReceiptHtml(sample)).not.toContain('C.C.');
    expect(buildNegocioReceiptHtml({ ...sample, customerIdNumber: ' ' })).not.toContain('C.C.');
  });

  it('marca el recibo anulado con sello y aviso', () => {
    const html = buildNegocioReceiptHtml({ ...sample, status: 'anulado' });

    expect(html).toContain('class="receipt is-voided"');
    expect(html).toContain('RECIBO ANULADO');
    expect(html).toContain('<span class="status status-void">Anulado</span>');
  });

  /**
   * Cobro sin señal: el cliente se lleva el papel, así que el recibo tiene que
   * decir que el pago todavía no está confirmado. Al confirmarse, desaparece.
   */
  describe('pago pendiente de confirmación', () => {
    it('lleva la leyenda y la explicación cuando el pago salió de la cola', () => {
      const html = buildNegocioReceiptHtml({ ...sample, pendingConfirmation: true });

      expect(html).toContain(PENDING_CONFIRMATION_RECEIPT_LEGEND);
      expect(html).toContain(PENDING_CONFIRMATION_RECEIPT_NOTE);
    });

    it('un pago confirmado no lleva leyenda', () => {
      for (const pendingConfirmation of [undefined, false, null]) {
        const html = buildNegocioReceiptHtml({ ...sample, pendingConfirmation });
        expect(html).not.toContain(PENDING_CONFIRMATION_RECEIPT_LEGEND);
        expect(html).not.toContain(PENDING_CONFIRMATION_RECEIPT_NOTE);
      }
    });

    it('un recibo anulado no mezcla los dos avisos', () => {
      const html = buildNegocioReceiptHtml({ ...sample, status: 'anulado', pendingConfirmation: true });

      expect(html).toContain('RECIBO ANULADO');
      expect(html).not.toContain(PENDING_CONFIRMATION_RECEIPT_LEGEND);
    });

    it('no agrega CSS nuevo (paridad con el recibo web)', () => {
      const css = (html: string) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
      expect(css(buildNegocioReceiptHtml({ ...sample, pendingConfirmation: true }))).toBe(
        css(buildNegocioReceiptHtml(sample))
      );
    });
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

describe('buildNegocioReceiptHtml: productos del negocio', () => {
  const products = [
    { quantity: 2, name: 'Colchón doble', unitPrice: 600_000, subtotal: 1_200_000 },
    { quantity: 1, name: 'Nevera <Haceb>', unitPrice: 1_500_000, subtotal: 1_500_000 },
  ];
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ quantity: 1, name: `Producto ${i + 1}`, unitPrice: 10_000, subtotal: 10_000 }));
  const sectionOf = (html: string) =>
    html.slice(html.indexOf('<section class="products'), html.indexOf('<section class="balance">'));

  it('muestra cantidad, producto, precio unitario, subtotal y total, después de los datos del pago y antes del saldo', () => {
    const html = buildNegocioReceiptHtml({ ...sample, products });
    const section = sectionOf(html);
    expect(section).toContain('<span class="products-title">Productos (2)</span>');
    // Sin tabla: un producto por línea.
    expect(section).not.toContain('<table');
    expect(section).toContain(
      `<li><span class="pq">2</span><span class="pn">Colchón doble</span><span class="pp">${formatCOP(600_000)} c/u</span><span class="ps">${formatCOP(1_200_000)}</span></li>`
    );
    expect(section).toContain('<span class="pn">Nevera &lt;Haceb&gt;</span>');
    expect(section).toContain(
      `<div class="products-total"><span>Total productos</span><strong>${formatCOP(2_700_000)}</strong></div>`
    );
    expect(html.indexOf('<section class="fields">')).toBeLessThan(html.indexOf('<section class="products'));
  });

  it('sin precios conocidos muestra solo cantidad y producto, sin inventar total', () => {
    const section = sectionOf(
      buildNegocioReceiptHtml({ ...sample, products: [{ quantity: 1, name: 'Base' }, { ...products[0] }] })
    );
    expect(section).toContain('<li><span class="pq">1</span><span class="pn">Base</span></li>');
    expect(section).not.toContain('c/u');
    expect(section).not.toContain('Total productos');
    expect(section).not.toContain('$');
  });

  it('con interés agrega «Interés» y «Total» bajo «Total productos», con la misma clase', () => {
    const section = sectionOf(buildNegocioReceiptHtml({ ...sample, products, totalCredit: 3_000_000 }));
    expect(section).toContain(
      `<div class="products-total"><span>Total productos</span><strong>${formatCOP(2_700_000)}</strong></div>` +
        `<div class="products-total"><span>Interés</span><strong>${formatCOP(300_000)}</strong></div>` +
        `<div class="products-total"><span>Total</span><strong>${formatCOP(3_000_000)}</strong></div>`
    );
  });

  it('sin interés (o sin total conocido) el recibo queda como antes', () => {
    for (const totalCredit of [2_700_000, null, undefined]) {
      const section = sectionOf(buildNegocioReceiptHtml({ ...sample, products, totalCredit }));
      expect(section).not.toContain('Interés');
      expect(section).not.toContain('<span>Total</span>');
    }
  });

  it('sin productos (o lista vacía) no aparece la sección', () => {
    expect(buildNegocioReceiptHtml(sample)).not.toContain('<section class="products');
    expect(buildNegocioReceiptHtml({ ...sample, products: [] })).not.toContain('<section class="products');
    expect(buildNegocioReceiptHtml({ ...sample, products: null })).not.toContain('<section class="products');
  });

  it('con muchos productos se compacta (letra menor), siempre un producto por línea', () => {
    const lines = (html: string) => sectionOf(html).split('<li>').length - 1;
    const four = buildNegocioReceiptHtml({ ...sample, products: many(4) });
    expect(four).toContain('<section class="products"><span');
    expect(lines(four)).toBe(4);
    const fifteen = buildNegocioReceiptHtml({ ...sample, products: many(15) });
    expect(fifteen).toContain('<section class="products is-compact"><span class="products-title">Productos (15)</span>');
    expect(lines(fifteen)).toBe(15);
    expect(fifteen).toContain(`<strong>${formatCOP(150_000)}</strong>`);
    const thirty = buildNegocioReceiptHtml({ ...sample, products: many(30) });
    expect(thirty).toContain('<section class="products is-dense">');
    expect(lines(thirty)).toBe(30);
  });

  it('no cambia los estilos: el CSS es el mismo con o sin productos', () => {
    const css = (html: string) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    expect(css(buildNegocioReceiptHtml({ ...sample, products }))).toBe(css(buildNegocioReceiptHtml(sample)));
    // La hoja horizontal es solo de la web.
    expect(buildNegocioReceiptHtml({ ...sample, products })).not.toContain('landscape');
  });

  it('arma las líneas con los valores del contrato (descripción primero)', () => {
    expect(
      receiptProductsFromItems([
        { quantity: 1, description: 'Colchón doble', product: { name: 'COLCHON D' }, unit_price: '600000', subtotal: 600000 },
        { quantity: '2', description: '', product: { name: 'Nevera' }, unit_price: 100, subtotal: 200 },
        { quantity: 1, description: null },
      ])
    ).toEqual([
      { quantity: 1, name: 'Colchón doble', unitPrice: 600_000, subtotal: 600_000 },
      { quantity: 2, name: 'Nevera', unitPrice: 100, subtotal: 200 },
      { quantity: 1, name: 'Producto', unitPrice: null, subtotal: null },
    ]);
    expect(receiptProductsFromItems(null)).toEqual([]);
  });
});

describe('logo del recibo', () => {
  it('va centrado y grande: todo el ancho útil hasta 400 px en pantalla y 70 mm impreso, sin deformarse', () => {
    const html = buildNegocioReceiptHtml(sample);
    expect(html).toContain('.brand { display: flex; flex-direction: column; align-items: center;');
    expect(html).toContain('.logo { display: block; width: 100%; max-width: 400px; height: auto; object-fit: contain; }');
    expect(html).toContain('  .logo { max-width: 70mm; filter: grayscale(1); }');
    // Ya no lleva los altos fijos anteriores (52 px en pantalla, 30 px impreso).
    expect(html).not.toMatch(/\.logo \{[^}]*height: \d+px/);
  });
});
