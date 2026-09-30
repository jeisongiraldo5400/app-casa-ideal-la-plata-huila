import { isReprint, printCopyDetail, printCopyLabel, type PrintCopyInfo } from '@/lib/printCopy';
import { textLines, type TicketLine } from './ticketLayout';

/**
 * Marca de reimpresión del ticket, igual que el PDF: «COPIA N.º X» y quién
 * la imprimió. El original (n.º 1) no lleva nada.
 */
export function copyTicketLines(copy: PrintCopyInfo | null | undefined): TicketLine[] {
  if (!isReprint(copy)) return [];
  return [
    { type: 'text', text: `*** ${printCopyLabel(copy)} ***`, align: 'center', bold: true },
    ...textLines(printCopyDetail(copy), { align: 'center' }),
    { type: 'separator' },
  ];
}
