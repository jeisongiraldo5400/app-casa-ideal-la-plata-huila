import { formatNegocioCodigo, labelNegocioStatus } from '@/lib/negocioLabels';
import {
  formatTicketMoney,
  padRow,
  textLines,
  type TicketLine,
} from './ticketLayout';

export type NegocioTicketItem = {
  quantity: number;
  description: string;
  subtotal: number;
};

export type NegocioTicketData = {
  numero: number;
  dealDate: string;
  status: string;
  customerName: string;
  customerIdNumber?: string | null;
  sellerName?: string | null;
  productsSubtotal: number;
  interestAmount: number;
  totalCredit: number;
  downPayment: number;
  financedAmount: number;
  installmentsCount: number;
  installmentAmount: number;
  frequency: string;
  items: NegocioTicketItem[];
};

function frequencyLabel(frequency: string): string {
  if (frequency === 'quincenal') return 'quincenal';
  if (frequency === 'semanal') return 'semanal';
  return 'mensual';
}

export function buildNegocioTicket(data: NegocioTicketData): TicketLine[] {
  const lines: TicketLine[] = [
    { type: 'text', text: 'CASA IDEAL', align: 'center', bold: true, size: 2 },
    { type: 'text', text: 'Ticket de negocio', align: 'center' },
    { type: 'separator' },
    ...textLines(`Negocio: ${formatNegocioCodigo(data.numero)}`),
    ...textLines(`Estado: ${labelNegocioStatus(data.status)}`),
    ...textLines(`Fecha: ${data.dealDate}`),
    ...textLines(`Cliente: ${data.customerName}`),
  ];

  if (data.customerIdNumber) {
    lines.push(...textLines(`C.C.: ${data.customerIdNumber}`));
  }
  if (data.sellerName) {
    lines.push(...textLines(`Vendedor: ${data.sellerName}`));
  }

  lines.push({ type: 'separator' });
  lines.push({ type: 'text', text: 'Articulos', bold: true });

  if (data.items.length === 0) {
    lines.push({ type: 'text', text: 'Sin articulos' });
  } else {
    for (const item of data.items) {
      const qty = Number(item.quantity) || 0;
      const label = `${qty}x ${item.description || 'Producto'}`;
      lines.push({
        type: 'text',
        text: padRow(label, formatTicketMoney(Number(item.subtotal) || 0)),
      });
    }
  }

  lines.push(
    { type: 'separator' },
    { type: 'text', text: padRow('Subtotal', formatTicketMoney(data.productsSubtotal)) },
    { type: 'text', text: padRow('Interes', formatTicketMoney(data.interestAmount)) },
    { type: 'text', text: padRow('Cuota inicial', formatTicketMoney(data.downPayment)) },
    { type: 'text', text: padRow('Financiado', formatTicketMoney(data.financedAmount)), bold: true },
    { type: 'text', text: padRow('Total credito', formatTicketMoney(data.totalCredit)), bold: true },
    ...textLines(
      `${data.installmentsCount} cuotas ${frequencyLabel(data.frequency)} de ${formatTicketMoney(data.installmentAmount)}`
    ),
    { type: 'separator' },
    { type: 'text', text: 'Contrato legal: compartir PDF', align: 'center' },
    { type: 'spacer', lines: 4 },
  );

  return lines;
}
