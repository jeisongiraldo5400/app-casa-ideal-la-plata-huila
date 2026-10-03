import {
  clip,
  formatTicketMoney,
  padRow,
  sanitizeSpaces,
  TICKET_WIDTH,
  wrapText,
} from '../ticketLayout';
import { sanitizeForEscPos } from '../escposEncoding';
import { buildPaymentTicket } from '../buildPaymentTicket';
import { buildNegocioTicket } from '../buildNegocioTicket';
import {
  filterDevicesForPlatform,
  iosClassicOnlyHint,
  isUsableOnPlatform,
  looksLikePt210,
  normalizePrinterAddress,
  scanRetryDelayMs,
  scanWatchdogMs,
} from '../printerTransport';
import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import {
  PENDING_CONFIRMATION_RECEIPT_LEGEND,
  PENDING_CONFIRMATION_RECEIPT_NOTE,
} from '@/lib/negocioReceiptHtml';

const receipt: NegocioReceiptData = {
  receiptNumber: 'RV-2026-001',
  status: 'emitido',
  paidAt: '2026-08-12T15:45:00.000Z',
  amount: 150000,
  physicalReceiptNumber: 'F-88',
  negocioNumero: 2026001,
  customerName: 'José Peña Restrepo',
  sellerName: 'Ana Gómez',
  remainingBalance: 850000,
};

describe('ticketLayout 58mm', () => {
  it('usa 32 caracteres por linea', () => {
    expect(TICKET_WIDTH).toBe(32);
  });

  it('alinea etiqueta y valor en una sola linea de 32', () => {
    const row = padRow('Valor recibido', formatTicketMoney(150000));
    expect(row.length).toBe(32);
    expect(row.startsWith('Valor recibido')).toBe(true);
    expect(row.includes('$')).toBe(true);
  });

  it('recorta la izquierda si no cabe junto al valor', () => {
    const row = padRow('Descripcion muy larga de un articulo', '$1.000');
    expect(row.length).toBe(32);
    expect(row.endsWith('$1.000')).toBe(true);
  });

  it('parte textos largos en lineas de 32', () => {
    const lines = wrapText('Cliente: Jose Pena Restrepo de La Plata Huila');
    expect(lines.every((line) => line.length <= 32)).toBe(true);
    expect(lines.join(' ')).toContain('Jose Pena Restrepo');
  });

  it('normaliza espacios no separables del formato COP', () => {
    expect(sanitizeSpaces('$\u00a01.234')).toBe('$ 1.234');
  });

  it('clip agrega puntos suspensivos ASCII', () => {
    expect(clip('ABCDEFGHIJ', 7)).toBe('ABCD...');
  });
});

describe('sanitizeForEscPos', () => {
  it('translitera tildes y n para la PT-210', () => {
    expect(sanitizeForEscPos('José Peña')).toBe('Jose Pena');
    expect(sanitizeForEscPos('¿Cuánto?')).toBe('?Cuanto?');
  });
});

describe('buildPaymentTicket', () => {
  it('incluye los campos del recibo actual', () => {
    const texts = buildPaymentTicket(receipt)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join('\n');

    expect(texts).toContain('CASA IDEAL');
    expect(texts).toContain('RV-2026-001');
    expect(texts).toContain('2026001');
    expect(texts).toContain('José Peña Restrepo');
    expect(texts).toContain('F-88');
    expect(texts.replace(/\s+/g, ' ')).toContain('12/08/2026 10:45 a. m.');
    expect(texts).toContain('Valor recibido');
    expect(texts).toContain('Saldo pendiente');
    expect(texts).not.toContain('RECIBO ANULADO');
  });

  /**
   * El papel es lo único que le queda al cliente: si el pago se tomó sin señal,
   * el ticket tiene que decir que falta la confirmación.
   */
  it('avisa cuando el pago está pendiente de confirmación', () => {
    const texts = buildPaymentTicket({ ...receipt, pendingConfirmation: true })
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join(' ')
      .replace(/\s+/g, ' ');

    expect(texts).toContain(PENDING_CONFIRMATION_RECEIPT_LEGEND);
    expect(texts).toContain(PENDING_CONFIRMATION_RECEIPT_NOTE);
  });

  it('un pago confirmado se imprime sin la leyenda de pendiente', () => {
    const texts = buildPaymentTicket(receipt)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join(' ');

    expect(texts).not.toContain(PENDING_CONFIRMATION_RECEIPT_LEGEND);
  });

  it('imprime el método y el sitio de pago como el recibo PDF', () => {
    const texts = buildPaymentTicket({
      ...receipt,
      paymentMethodName: 'Nequi',
      paymentSiteName: 'Aplicación Móvil',
    })
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join('\n');

    expect(texts).toContain('Metodo de pago: Nequi');
    expect(texts).toContain('Sitio de pago: Aplicación Móvil');
  });

  it('dice «No registrado» en pagos sin método ni sitio (anteriores al catálogo)', () => {
    const texts = buildPaymentTicket(receipt)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text);

    expect(texts).toContain('Metodo de pago: No registrado');
    expect(texts).toContain('Sitio de pago: No registrado');
  });

  it('imprime la cédula debajo del cliente y la omite si no hay', () => {
    const lines = (data: typeof receipt) =>
      buildPaymentTicket(data)
        .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
        .map((line) => line.text);
    const withId = lines({ ...receipt, customerIdNumber: '1.061.111.222' });
    const clienteAt = withId.findIndex((text) => text.startsWith('Cliente:'));
    expect(withId[clienteAt + 1]).toBe('C.C.: 1.061.111.222');
    expect(withId.every((text) => text.length <= 32)).toBe(true);
    expect(lines({ ...receipt, customerIdNumber: '  ' }).join('\n')).not.toContain('C.C.');
    expect(lines(receipt).join('\n')).not.toContain('C.C.');
  });

  it('marca recibos anulados', () => {
    const texts = buildPaymentTicket({ ...receipt, status: 'anulado' })
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text);

    expect(texts).toContain('RECIBO ANULADO');
  });

  describe('pronto pago', () => {
    const prontoPago: NegocioReceiptData = {
      ...receipt,
      amount: 900_000,
      remainingBalance: 0,
      paymentKind: 'pronto_pago',
      discountAmount: 100_000,
      discountReason: 'Paga todo el credito',
      expectedTotal: 1_000_000,
    };
    const ticketTexts = (data: NegocioReceiptData) =>
      buildPaymentTicket(data)
        .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
        .map((line) => line.text);

    it('imprime total pendiente, descuento, total pagado, saldo $0 y la leyenda', () => {
      const texts = ticketTexts(prontoPago);

      expect(texts).toContain('Recibo de pago - Pronto pago');
      expect(texts).toContain(padRow('Total pendiente', formatTicketMoney(1_000_000)));
      expect(texts).toContain(padRow('Descuento', formatTicketMoney(100_000)));
      expect(texts).toContain(padRow('Total pagado', formatTicketMoney(900_000)));
      expect(texts).toContain(padRow('Saldo pendiente', formatTicketMoney(0)));
      expect(texts.join(' ')).toContain('Motivo descuento: Paga todo el credito');
      expect(texts.join(' ')).toContain('Crédito cancelado por pronto pago.');
      expect(texts).not.toContain(padRow('Valor recibido', formatTicketMoney(900_000)));
      // El orden es el del recibo: pendiente − descuento = pagado, luego saldo.
      const order = ['Total pendiente', 'Descuento', 'Total pagado', 'Saldo pendiente'].map((label) =>
        texts.findIndex((text) => text.startsWith(label))
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(texts.every((text) => text.length <= 32)).toBe(true);
    });

    it('sin motivo no imprime la línea «Motivo descuento»', () => {
      for (const discountReason of [null, '', '  ']) {
        const texts = ticketTexts({ ...prontoPago, discountReason }).join(' ');
        expect(texts).toContain('Descuento');
        expect(texts).not.toContain('Motivo descuento');
      }
    });

    it('sin `expectedTotal` deriva el pendiente de valor + descuento', () => {
      const texts = ticketTexts({ ...prontoPago, expectedTotal: null });
      expect(texts).toContain(padRow('Total pendiente', formatTicketMoney(1_000_000)));
    });

    it('anulado conserva los montos pero no dice que el crédito quedó cancelado', () => {
      const texts = ticketTexts({ ...prontoPago, status: 'anulado' }).join(' ');
      expect(texts).toContain('RECIBO ANULADO');
      expect(texts).toContain('Total pendiente');
      expect(texts).not.toContain('cancelado por pronto pago');
    });

    it('un abono sigue con «Valor recibido» y sin campos de descuento', () => {
      const texts = ticketTexts({ ...receipt, paymentKind: 'abono', discountAmount: 0 }).join(' ');
      expect(texts).toContain('Valor recibido');
      expect(texts).not.toContain('Descuento');
      expect(texts).not.toContain('Pronto pago');
    });
  });

  describe('productos del negocio', () => {
    const textsOf = (data: NegocioReceiptData) =>
      buildPaymentTicket(data)
        .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
        .map((line) => line.text);
    const longName = 'Nevera Haceb 260 L No Frost con dispensador de agua';

    it('lista «cantidad x nombre» con el subtotal a la derecha y el total, antes del valor recibido', () => {
      const texts = textsOf({
        ...receipt,
        products: [
          { quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 },
          { quantity: 1, name: longName, unitPrice: 1500000, subtotal: 1500000 },
        ],
      });
      const start = texts.indexOf('Productos');
      expect(start).toBeGreaterThan(-1);
      expect(texts[start + 1]).toBe(padRow('2x Colchón doble', formatTicketMoney(1200000)));
      expect(texts[start + 2]).toBe(padRow(`1x ${longName}`, formatTicketMoney(1500000)));
      expect(texts[start + 3]).toBe(padRow('Total productos', formatTicketMoney(2700000)));
      for (const text of texts.slice(start, start + 4)) expect(text.length).toBeLessThanOrEqual(TICKET_WIDTH);
      expect(texts.findIndex((text) => text.startsWith('Valor recibido'))).toBeGreaterThan(start + 3);
    });

    it('con interés imprime «Interes» y «Total» del negocio bajo el total de productos', () => {
      const texts = textsOf({
        ...receipt,
        products: [{ quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 }],
        totalCredit: 1500000,
      });
      const start = texts.indexOf('Productos');
      expect(texts[start + 2]).toBe(padRow('Total productos', formatTicketMoney(1200000)));
      expect(texts[start + 3]).toBe(padRow('Interes', formatTicketMoney(300000)));
      expect(texts[start + 4]).toBe(padRow('Total', formatTicketMoney(1500000)));
    });

    it('sin interés no imprime las líneas de interés', () => {
      const texts = textsOf({
        ...receipt,
        products: [{ quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 }],
        totalCredit: 1200000,
      });
      expect(texts.some((text) => text.startsWith('Interes'))).toBe(false);
    });

    it('sin precios descargados imprime solo cantidad y nombre, sin total', () => {
      const texts = textsOf({ ...receipt, products: [{ quantity: 1, name: longName }] });
      const start = texts.indexOf('Productos');
      expect(texts[start + 1]).toBe(clip(`1x ${longName}`, TICKET_WIDTH));
      expect(texts.some((text) => text.startsWith('Total productos'))).toBe(false);
    });

    it('sin productos no imprime la sección', () => {
      expect(textsOf(receipt)).not.toContain('Productos');
      expect(textsOf({ ...receipt, products: [] })).not.toContain('Productos');
    });
  });

  it('termina con avance de papel porque la PT-210 no corta', () => {
    const ticket = buildPaymentTicket(receipt);
    expect(ticket[ticket.length - 1]).toEqual({ type: 'spacer', lines: 4 });
  });
});

describe('buildNegocioTicket', () => {
  const negocio = {
    numero: 2026001,
    dealDate: '2026-08-01',
    status: 'activo',
    customerName: 'María López',
    customerIdNumber: '12.345.678',
    sellerName: 'Ana',
    productsSubtotal: 1_000_000,
    interestAmount: 200_000,
    totalCredit: 1_200_000,
    downPayment: 100_000,
    financedAmount: 1_100_000,
    installmentsCount: 12,
    installmentAmount: 91_667,
    frequency: 'mensual',
    items: [
      { quantity: 2, description: 'Colchon doble premium extra largo', subtotal: 800_000 },
      { quantity: 1, description: 'Base', subtotal: 200_000 },
    ],
  };

  it('resume el negocio sin texto legal', () => {
    const texts = buildNegocioTicket(negocio)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text)
      .join('\n');

    expect(texts).toContain('Ticket de negocio');
    expect(texts).toContain('2026001');
    expect(texts).toContain('María López');
    expect(texts).toContain('2x Colchon');
    expect(texts).toContain('Financiado');
    expect(texts).toContain('12 cuotas mensual');
    expect(texts).toContain('Contrato legal: compartir PDF');
    expect(texts).not.toContain('centrales de riesgo');
  });

  it('Subtotal → Interes → Total credito, y el interés solo cuando lo hay', () => {
    const textsOf = (data: typeof negocio) =>
      buildNegocioTicket(data)
        .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
        .map((line) => line.text);
    const texts = textsOf(negocio);
    const subtotal = texts.indexOf(padRow('Subtotal', formatTicketMoney(1_000_000)));
    expect(subtotal).toBeGreaterThan(-1);
    expect(texts[subtotal + 1]).toBe(padRow('Interes', formatTicketMoney(200_000)));
    expect(texts[subtotal + 2]).toBe(padRow('Total credito', formatTicketMoney(1_200_000)));

    const sinInteres = textsOf({ ...negocio, interestAmount: 0, totalCredit: 1_000_000 });
    const start = sinInteres.indexOf(padRow('Subtotal', formatTicketMoney(1_000_000)));
    expect(sinInteres.some((text) => text.startsWith('Interes'))).toBe(false);
    expect(sinInteres[start + 1]).toBe(padRow('Total credito', formatTicketMoney(1_000_000)));
  });

  it('muestra sin articulos cuando la lista esta vacia', () => {
    const texts = buildNegocioTicket({ ...negocio, items: [] })
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .map((line) => line.text);

    expect(texts).toContain('Sin articulos');
  });

  it('no excede 32 caracteres en filas de articulos', () => {
    const itemRows = buildNegocioTicket(negocio)
      .filter((line): line is Extract<typeof line, { type: 'text' }> => line.type === 'text')
      .filter((line) => line.text.includes('x '));

    expect(itemRows.length).toBeGreaterThan(0);
    expect(itemRows.every((line) => line.text.length <= 32)).toBe(true);
  });
});

describe('printerTransport', () => {
  it('reconoce nombres tipicos de la PT-210', () => {
    expect(looksLikePt210('PT-210')).toBe(true);
    expect(looksLikePt210('Goojprt PT210')).toBe(true);
    expect(looksLikePt210('CaysnPrinter')).toBe(true);
    expect(looksLikePt210('RPP02N_C0E9')).toBe(true);
    expect(looksLikePt210('PR-812')).toBe(true);
    expect(looksLikePt210('iPhone')).toBe(false);
  });

  it('antepone ble: a UUID de iOS para no tratarlo como LAN', () => {
    expect(
      normalizePrinterAddress(
        { address: '4E9D74F6-AAAA-BBBB-CCCC-DDDDEEEEFFFF', deviceType: 'ble' },
        'ios'
      )
    ).toBe('ble:4E9D74F6-AAAA-BBBB-CCCC-DDDDEEEEFFFF');
    expect(
      normalizePrinterAddress(
        { address: 'AA:BB:CC:DD:EE:FF', deviceType: 'bt' },
        'android'
      )
    ).toBe('bt:AA:BB:CC:DD:EE:FF');
  });

  it('reintenta el escaneo si la primera pasada vuelve vacia', () => {
    expect(scanRetryDelayMs(0, 0, 3)).toBe(400);
    expect(scanRetryDelayMs(1, 0, 3)).toBeNull();
    expect(scanRetryDelayMs(0, 2, 3)).toBeNull();
  });

  it('limita el primer escaneo de iOS para no quedar colgado', () => {
    expect(scanWatchdogMs('ios', 0)).toBe(4000);
    expect(scanWatchdogMs('ios', 1)).toBe(8000);
    expect(scanWatchdogMs('android', 0)).toBe(15000);
  });

  it('en iOS solo deja BLE o dual', () => {
    const classic = { name: 'PT-210', address: 'bt:AA:BB', deviceType: 'bt' as const };
    const ble = { name: 'PT-210', address: 'ble:AA:BB', deviceType: 'ble' as const };
    expect(isUsableOnPlatform(classic, 'ios')).toBe(false);
    expect(isUsableOnPlatform(ble, 'ios')).toBe(true);
    expect(filterDevicesForPlatform([classic, ble], 'ios')).toEqual([ble]);
    expect(iosClassicOnlyHint([classic], 'ios')).toBe(true);
    expect(iosClassicOnlyHint([classic], 'android')).toBe(false);
  });
});

describe('marca de copia en los tickets', () => {
  const copy = { number: 2, printedAt: '2026-09-30T15:15:00Z', printedBy: 'Ana' };
  const texts = (lines: { type: string; text?: string }[]) =>
    lines.filter((line) => line.type === 'text').map((line) => line.text ?? '');

  it('el recibo reimpreso dice COPIA N.º 2 y quién lo imprimió', () => {
    const lines = texts(buildPaymentTicket({ ...receipt, copy }));
    expect(lines).toContain('*** COPIA N.º 2 ***');
    expect(lines.some((line) => line.startsWith('Impresa el 30/09/2026'))).toBe(true);
    expect(lines.join('\n')).toContain('Ana');
  });

  it('el original no lleva marca', () => {
    const lines = texts(buildPaymentTicket({ ...receipt, copy: { ...copy, number: 1 } }));
    expect(lines.join('\n')).not.toContain('COPIA');
  });

  it('el ticket del negocio reimpreso también', () => {
    const lines = texts(
      buildNegocioTicket({
        numero: 20260202,
        dealDate: '2026-09-29',
        status: 'activo',
        customerName: 'Cliente',
        productsSubtotal: 100,
        interestAmount: 0,
        totalCredit: 100,
        downPayment: 0,
        financedAmount: 100,
        installmentsCount: 1,
        installmentAmount: 100,
        frequency: 'mensual',
        items: [],
        copy,
      })
    );
    expect(lines.slice(0, 5)).toContain('*** COPIA N.º 2 ***');
  });
});
