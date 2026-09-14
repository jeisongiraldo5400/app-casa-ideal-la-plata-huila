import {
  PRONTO_PAGO_RECEIPT_LEGEND,
  isProntoPagoReceipt,
  prontoPagoReceiptAmounts,
  receiptRegisteredBy,
  type NegocioReceiptData,
} from '@/lib/negocioReceiptHtml';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';
import {
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
  const lines: TicketLine[] = [
    { type: 'text', text: 'CASA IDEAL', align: 'center', bold: true, size: 2 },
    { type: 'text', text: prontoPago ? 'Recibo de pago - Pronto pago' : 'Recibo de pago', align: 'center' },
    { type: 'separator' },
  ];

  if (data.status === 'anulado') {
    lines.push({ type: 'text', text: 'RECIBO ANULADO', align: 'center', bold: true });
  }

  lines.push(
    ...textLines(`Recibo: ${data.receiptNumber}`),
    ...textLines(`Negocio: ${formatNegocioCodigo(data.negocioNumero)}`),
    ...textLines(`Cliente: ${data.customerName}`),
    ...textLines(`Fecha y hora: ${formatPaymentDateTime(data.paidAt)}`),
    ...textLines(`Recibo fisico: ${data.physicalReceiptNumber || 'No aplica'}`),
    // Mismos campos y textos por defecto que el recibo PDF (negocioReceiptHtml).
    ...textLines(`Metodo de pago: ${data.paymentMethodName || 'No registrado'}`),
    ...textLines(`Sitio de pago: ${data.paymentSiteName || 'No registrado'}`),
    ...textLines(`Registrado por: ${receiptRegisteredBy(data)}`),
    ...(prontoPago && discountReason ? textLines(`Motivo descuento: ${discountReason}`) : []),
    { type: 'separator' },
  );
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
