import {
  PENDING_CONFIRMATION_RECEIPT_LEGEND,
  PENDING_CONFIRMATION_RECEIPT_NOTE,
  PRONTO_PAGO_RECEIPT_LEGEND,
  formatReceiptQuantity,
  isPendingConfirmationReceipt,
  isProntoPagoReceipt,
  prontoPagoReceiptAmounts,
  receiptCustomerIdNumber,
  receiptInterestAmount,
  receiptProducts,
  receiptProductsHavePrices,
  receiptProductsTotal,
  receiptRegisteredBy,
  type NegocioReceiptData,
} from '@/lib/negocioReceiptHtml';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';
import { copyTicketLines } from './copyTicketLines';
import {
  TICKET_WIDTH,
  clip,
  formatTicketMoney,
  padRow,
  textLines,
  type TicketLine,
} from './ticketLayout';

export function buildPaymentTicket(data: NegocioReceiptData): TicketLine[] {
  const prontoPago = isProntoPagoReceipt(data);
  const pronto = prontoPagoReceiptAmounts(data);
  // Motivo opcional: sin motivo no se imprime la línea (igual que el recibo PDF).
  const discountReason = String(data.discountReason ?? '').trim();
  // Sin cédula registrada se omite la línea (igual que el recibo PDF).
  const customerIdNumber = receiptCustomerIdNumber(data);
  const lines: TicketLine[] = [
    { type: 'text', text: 'CASA IDEAL', align: 'center', bold: true, size: 2 },
    { type: 'text', text: prontoPago ? 'Recibo de pago - Pronto pago' : 'Recibo de pago', align: 'center' },
    { type: 'separator' },
  ];

  if (data.status === 'anulado') {
    lines.push({ type: 'text', text: 'RECIBO ANULADO', align: 'center', bold: true });
  }

  lines.push(...copyTicketLines(data.copy));

  // Pago tomado sin señal: el cliente se lleva el recibo, así que en el papel
  // debe verse que todavía falta la confirmación del servidor.
  if (isPendingConfirmationReceipt(data)) {
    lines.push(
      ...textLines(PENDING_CONFIRMATION_RECEIPT_LEGEND, { align: 'center', bold: true }),
      ...textLines(PENDING_CONFIRMATION_RECEIPT_NOTE, { align: 'center' }),
      { type: 'separator' }
    );
  }

  lines.push(
    ...textLines(`Recibo: ${data.receiptNumber}`),
    ...textLines(`Negocio: ${formatNegocioCodigo(data.negocioNumero)}`),
    ...textLines(`Cliente: ${data.customerName}`),
    ...(customerIdNumber ? textLines(`C.C.: ${customerIdNumber}`) : []),
    ...textLines(`Fecha y hora: ${formatPaymentDateTime(data.paidAt)}`),
    ...textLines(`Recibo fisico: ${data.physicalReceiptNumber || 'No aplica'}`),
    // Mismos campos y textos por defecto que el recibo PDF (negocioReceiptHtml).
    ...textLines(`Metodo de pago: ${data.paymentMethodName || 'No registrado'}`),
    ...textLines(`Sitio de pago: ${data.paymentSiteName || 'No registrado'}`),
    ...textLines(`Registrado por: ${receiptRegisteredBy(data)}`),
    ...(prontoPago && discountReason ? textLines(`Motivo descuento: ${discountReason}`) : []),
    { type: 'separator' },
  );
  // Productos del negocio, como en el ticket del negocio: «2x Nombre» con el
  // subtotal a la derecha (el nombre se recorta al ancho del papel) y el total.
  // Sin precios descargados sale solo la cantidad y el nombre.
  const products = receiptProducts(data);
  if (products.length > 0) {
    const withPrices = receiptProductsHavePrices(products);
    lines.push(
      { type: 'text', text: 'Productos', bold: true },
      ...products.map((product): TicketLine => {
        const label = `${formatReceiptQuantity(product.quantity)}x ${product.name}`;
        return {
          type: 'text',
          text: withPrices ? padRow(label, formatTicketMoney(Number(product.subtotal))) : clip(label, TICKET_WIDTH),
        };
      }),
      ...(withPrices
        ? [{ type: 'text', text: padRow('Total productos', formatTicketMoney(receiptProductsTotal(products))), bold: true } as TicketLine]
        : []),
      // Con interés: «Interes» y «Total» (total del negocio) bajo los productos.
      ...(withPrices && receiptInterestAmount(data, products) > 0
        ? [
            { type: 'text', text: padRow('Interes', formatTicketMoney(receiptInterestAmount(data, products))) } as TicketLine,
            { type: 'text', text: padRow('Total', formatTicketMoney(Number(data.totalCredit))), bold: true } as TicketLine,
          ]
        : []),
      { type: 'separator' },
    );
  }
  if (prontoPago) {
    lines.push(
      { type: 'text', text: padRow('Total pendiente', formatTicketMoney(pronto.expectedTotal)) },
      { type: 'text', text: padRow('Descuento', formatTicketMoney(pronto.discount)) },
      { type: 'text', text: padRow('Total pagado', formatTicketMoney(data.amount)), bold: true },
    );
  } else {
    lines.push({ type: 'text', text: padRow('Valor recibido', formatTicketMoney(data.amount)), bold: true });
  }
  lines.push(
    // Un pronto pago liquida todo el crédito: el saldo que deja siempre es 0.
    { type: 'text', text: padRow('Saldo pendiente', formatTicketMoney(prontoPago ? 0 : data.remainingBalance)) },
    { type: 'separator' },
    ...(prontoPago && data.status !== 'anulado'
      ? [...textLines(PRONTO_PAGO_RECEIPT_LEGEND, { align: 'center', bold: true }), { type: 'separator' } as TicketLine]
      : []),
    { type: 'text', text: 'Comprobante SGI Casa Ideal', align: 'center' },
    { type: 'spacer', lines: 4 },
  );

  return lines;
}

export function buildTestTicket(): TicketLine[] {
  return [
    { type: 'text', text: 'CASA IDEAL', align: 'center', bold: true, size: 2 },
    { type: 'text', text: 'Prueba de impresora', align: 'center' },
    { type: 'separator' },
    { type: 'text', text: 'Conexion correcta.', align: 'center' },
    { type: 'spacer', lines: 4 },
  ];
}
