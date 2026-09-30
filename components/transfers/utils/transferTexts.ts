/** Textos de los traslados en la app (puros; se prueban sin React). */
import { formatPaymentDateTime } from '@/lib/localDate';
import type { StatusTone } from '@/components/ui/StatusChip';
import type { TransferItem, TransferStatus, TransferSummary } from './transferModel';
import type { DispatchSummary, ReceiveSummary, ReturnSummary, TransferMode } from './transferRules';

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  draft: 'Borrador',
  pending_dispatch: 'Por despachar',
  in_transit: 'En tránsito',
  partially_received: 'Recibido en parte',
  received: 'Recibido',
  with_differences: 'Con diferencias',
  closed_with_differences: 'Cerrado con diferencias',
  cancelled: 'Cancelado',
};

export const TRANSFER_STATUS_TONE: Record<TransferStatus, StatusTone> = {
  draft: 'neutral',
  pending_dispatch: 'warning',
  in_transit: 'info',
  partially_received: 'info',
  received: 'success',
  with_differences: 'error',
  closed_with_differences: 'neutral',
  cancelled: 'neutral',
};

export const TRANSFER_MODE_LABEL: Record<TransferMode, string> = {
  dispatch: 'Despachar',
  receive: 'Recibir',
  return: 'Confirmar devolución',
  view: 'Ver',
};

/** Cantidades: siempre unidades enteras (el servidor manda numeric, p. ej. 3.00). */
export function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function unitsText(value: number): string {
  return `${formatQty(value)} ${value === 1 ? 'unidad' : 'unidades'}`;
}

export function transferRouteText(order: Pick<TransferSummary, 'sourceWarehouse' | 'destinationWarehouse'>): string {
  return `${order.sourceWarehouse.name} → ${order.destinationWarehouse.name}`;
}

export function formatTransferDate(value: string | null | undefined): string {
  return formatPaymentDateTime(value ?? null);
}

/** «Vence …» / «Vencido desde …» para un traslado despachado; null si no aplica. */
export function dueText(order: Pick<TransferSummary, 'dueAt' | 'isOverdue'>): string | null {
  if (!order.dueAt) return null;
  return order.isOverdue
    ? `Vencido desde ${formatTransferDate(order.dueAt)}`
    : `Debe llegar antes de ${formatTransferDate(order.dueAt)}`;
}

/** «Te enviaron: N × Producto — transporta X — despachado el …» */
export function sentLineText(
  item: Pick<TransferItem, 'dispatchedQuantity' | 'productName'>,
  order: Pick<TransferSummary, 'carrier' | 'dispatchedAt'>
): string {
  const carrier = order.carrier?.name ? `transporta ${order.carrier.name}` : 'sin transportador';
  const date = order.dispatchedAt ? `despachado el ${formatTransferDate(order.dispatchedAt)}` : 'sin fecha de despacho';
  return `Te enviaron: ${formatQty(item.dispatchedQuantity)} × ${item.productName} — ${carrier} — ${date}`;
}

export function dispatchConfirmText(summary: DispatchSummary, order: TransferSummary, carrierName: string | null): string {
  const parts = [
    `Vas a despachar ${unitsText(summary.units)} (${summary.lines} producto${summary.lines === 1 ? '' : 's'}) de ${transferRouteText(order)}.`,
  ];
  if (summary.released > 0) {
    parts.push(`${unitsText(summary.released)} no ${summary.released === 1 ? 'sale' : 'salen'} y ${summary.released === 1 ? 'vuelve' : 'vuelven'} al disponible de ${order.sourceWarehouse.name}.`);
  }
  parts.push(carrierName ? `Transporta: ${carrierName}.` : 'Sin transportador asignado.');
  parts.push('Solo se despacha una vez: lo que no marques ahora no podrá salir en este traslado.');
  return parts.join('\n');
}

export function receiveConfirmText(summary: ReceiveSummary, order: TransferSummary): string {
  const parts: string[] = [];
  if (summary.ok + summary.damaged > 0) {
    parts.push(`Recibes en ${order.destinationWarehouse.name}: ${unitsText(summary.ok)} en buen estado${summary.damaged > 0 ? ` y ${unitsText(summary.damaged)} averiada${summary.damaged === 1 ? '' : 's'}` : ''}.`);
  }
  if (summary.remaining > 0) {
    parts.push(
      summary.reportMissing
        ? `Informas que ${summary.remaining === 1 ? 'falta' : 'faltan'} ${unitsText(summary.remaining)}: el traslado queda con diferencias para que el administrador lo resuelva.`
        : `${unitsText(summary.remaining)} ${summary.remaining === 1 ? 'sigue' : 'siguen'} en camino: puedes recibir${summary.remaining === 1 ? 'la' : 'las'} después.`
    );
  } else if (summary.reportMissing) {
    parts.push('Informas que no llegó el resto.');
  }
  return parts.join('\n');
}

export function returnConfirmText(summary: ReturnSummary, order: TransferSummary): string {
  const parts = [`Confirmas que volvieron ${unitsText(summary.units)} a ${order.sourceWarehouse.name}.`];
  if (summary.remaining > 0) parts.push(`Quedan ${unitsText(summary.remaining)} por volver.`);
  return parts.join('\n');
}

export const OFFLINE_TRANSFER_MESSAGE =
  'Sin señal: para despachar o recibir necesitas conexión. Lo que marcaste queda guardado mientras no cierres la app.';

/**
 * Por qué no hay acción disponible (modo solo lectura). `userId` permite decir
 * «despachaste» / «transportas» en vez de un genérico.
 */
export function viewNotice(
  order: Pick<TransferSummary, 'status' | 'dispatchedBy' | 'carrier' | 'sourceWarehouse' | 'destinationWarehouse' | 'pendingReceiptQuantity'>,
  userId: string | null | undefined
): string | null {
  const destination = order.destinationWarehouse.name;
  switch (order.status) {
    case 'draft':
      return 'Borrador: se edita y se envía a despacho desde la web.';
    case 'pending_dispatch':
      return `Espera despacho en ${order.sourceWarehouse.name}.`;
    case 'in_transit':
    case 'partially_received':
    case 'with_differences':
      if (order.pendingReceiptQuantity <= 0) {
        return order.status === 'with_differences'
          ? 'Con diferencias: el administrador las resuelve desde la web.'
          : null;
      }
      if (userId && order.dispatchedBy?.id === userId) {
        return `Despachaste este traslado: lo recibe un bodeguero en ${destination}.`;
      }
      if (userId && order.carrier?.id === userId) {
        return `Transportas este traslado: al llegar, un bodeguero en ${destination} confirma la recepción.`;
      }
      return `Lo recibe un bodeguero en ${destination}.`;
    case 'received':
      return 'Traslado recibido completo.';
    case 'closed_with_differences':
      return 'Cerrado con diferencias.';
    case 'cancelled':
      return 'Traslado cancelado.';
    default:
      return null;
  }
}
