import { formatNegocioCodigo, labelNegocioStatus } from '@/lib/negocioLabels';
import { parseDownPaymentSchedule, type DownPaymentEntry } from '@/lib/negocios/negocioCreditRules';
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
  downPaymentDate?: string | null;
  /** Abonos iniciales pactados; si falta se reconstruye desde downPayment/downPaymentDate. */
  downPaymentSchedule?: DownPaymentEntry[] | null;
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

  const downPaymentSchedule = parseDownPaymentSchedule(data.downPaymentSchedule, {
    down_payment: data.downPayment,
    down_payment_date: data.downPaymentDate,
    deal_date: data.dealDate,
  });
  const downPaymentLines: TicketLine[] =
    downPaymentSchedule.length > 1
      ? [
          { type: 'text', text: padRow('Abonos iniciales', formatTicketMoney(data.downPayment)) },
          ...downPaymentSchedule.map((abono) => ({
            type: 'text' as const,
            text: padRow(`  ${abono.due_date}`, formatTicketMoney(abono.amount)),
          })),
        ]
      : [
          { type: 'text', text: padRow('Cuota inicial', formatTicketMoney(data.downPayment)) },
          ...(downPaymentSchedule[0]
            ? [{ type: 'text' as const, text: padRow('Paga inicial', downPaymentSchedule[0].due_date) }]
            : []),
        ];

  lines.push(
    { type: 'separator' },
    { type: 'text', text: padRow('Subtotal', formatTicketMoney(data.productsSubtotal)) },
    { type: 'text', text: padRow('Interes', formatTicketMoney(data.interestAmount)) },
    ...downPaymentLines,
    { type: 'text', text: padRow('Financiado', formatTicketMoney(data.financedAmount)), bold: true },
    { type: 'text', text: padRow('Total credito', formatTicketMoney(data.totalCredit)), bold: true },
    ...textLines(
      data.installmentsCount > 0
        ? `${data.installmentsCount} cuotas ${frequencyLabel(data.frequency)} de ${formatTicketMoney(data.installmentAmount)}`
        : 'Sin cuotas: pagado con abonos iniciales'
    ),
    { type: 'separator' },
    { type: 'text', text: 'Contrato legal: compartir PDF', align: 'center' },
    { type: 'spacer', lines: 4 },
  );

  return lines;
}
