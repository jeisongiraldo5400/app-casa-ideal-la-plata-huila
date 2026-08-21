import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';
import {
  formatTicketMoney,
  padRow,
  textLines,
  type TicketLine,
} from './ticketLayout';

export function buildPaymentTicket(data: NegocioReceiptData): TicketLine[] {
  const lines: TicketLine[] = [
    { type: 'text', text: 'CASA IDEAL', align: 'center', bold: true, size: 2 },
    { type: 'text', text: 'Recibo de pago', align: 'center' },
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
    ...textLines(`Registrado por: ${data.sellerName || 'Casa Ideal'}`),
    { type: 'separator' },
    { type: 'text', text: padRow('Valor recibido', formatTicketMoney(data.amount)), bold: true },
    { type: 'text', text: padRow('Saldo pendiente', formatTicketMoney(data.remainingBalance)) },
    { type: 'separator' },
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
