/** Textos de los traslados en la app (puros; se prueban sin React). */
import { formatPaymentDateTime } from '@/lib/localDate';
import type { StatusTone } from '@/components/ui/StatusChip';
import type { PersonRef, TransferItem, TransferStatus, TransferSummary } from './transferModel';
import type { DispatchSummary, ReceiveSummary, ReturnSummary, TransferMode } from './transferRules';

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  draft: 'Borrador',
  pending_dispatch: 'Por sacar',
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
  dispatch: 'Sacar productos',
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

/** «Vence …» / «Vencido desde …» para un traslado ya sacado; null si no aplica. */
export function dueText(order: Pick<TransferSummary, 'dueAt' | 'isOverdue'>): string | null {
  if (!order.dueAt) return null;
  return order.isOverdue
    ? `Vencido desde ${formatTransferDate(order.dueAt)}`
    : `Debe llegar antes de ${formatTransferDate(order.dueAt)}`;
}

/** «Te enviaron: N × Producto — sacado el …» (+ «transporta X» solo en traslados viejos). */
export function sentLineText(
  item: Pick<TransferItem, 'dispatchedQuantity' | 'productName'>,
  order: Pick<TransferSummary, 'carrier' | 'dispatchedAt'>
): string {
  const carrier = order.carrier?.name ? ` — transporta ${order.carrier.name}` : '';
  const date = order.dispatchedAt ? `sacado el ${formatTransferDate(order.dispatchedAt)}` : 'sin fecha de salida';
  return `Te enviaron: ${formatQty(item.dispatchedQuantity)} × ${item.productName}${carrier} — ${date}`;
}

/** Confirmación del paso «Sacar productos» (ya no se pide transportador). */
export function dispatchConfirmText(summary: DispatchSummary, order: TransferSummary): string {
  const parts = [
    `Vas a sacar ${unitsText(summary.units)} (${summary.lines} producto${summary.lines === 1 ? '' : 's'}) de ${transferRouteText(order)}.`,
  ];
  if (summary.released > 0) {
    parts.push(`${unitsText(summary.released)} no ${summary.released === 1 ? 'sale' : 'salen'} y ${summary.released === 1 ? 'vuelve' : 'vuelven'} al disponible de ${order.sourceWarehouse.name}.`);
  }
  parts.push(order.receiver ? `Recibe: ${order.receiver.name}. Le llegará un aviso.` : `${NO_RECEIVER_DISPATCH_TEXT}.`);
  parts.push('Los productos se sacan una sola vez: lo que no marques ahora no podrá salir en este traslado.');
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

/** Al sacar los productos, sin receptor asignado (20261231470000). */
export const NO_RECEIVER_DISPATCH_TEXT = 'Sin receptor asignado: solo un administrador podrá recibirlo';
/** En el detalle de un traslado en camino sin receptor asignado. */
export const NO_RECEIVER_DETAIL_TEXT = 'Sin receptor asignado: solo un administrador puede recibirlo.';

/** «Recibe: X» del paso «Sacar productos». */
export function receiverLineText(receiver: PersonRef | null): string {
  return receiver ? `Recibe: ${receiver.name}` : NO_RECEIVER_DISPATCH_TEXT;
}

/** «Saca: X · Recibe: Y» (asignados por el admin al crear; 20261231470000). */
export function assignmentText(order: Pick<TransferSummary, 'dispatcher' | 'receiver'>): string {
  return `Saca: ${order.dispatcher?.name ?? 'sin asignar'} · Recibe: ${order.receiver?.name ?? 'sin asignar'}`;
}

export const OFFLINE_TRANSFER_MESSAGE =
  'Sin señal: para sacar productos o recibir necesitas conexión. Lo que marcaste queda guardado mientras no cierres la app.';

/**
 * Por qué no hay acción disponible (modo solo lectura). `userId` permite decir
 * «sacaste» / «transportas» en vez de un genérico.
 */
export function viewNotice(
  order: Pick<
    TransferSummary,
    | 'status'
    | 'dispatchedBy'
    | 'carrier'
    | 'dispatcher'
    | 'receiver'
    | 'sourceWarehouse'
    | 'destinationWarehouse'
    | 'pendingReceiptQuantity'
  >,
  userId: string | null | undefined
): string | null {
  const destination = order.destinationWarehouse.name;
  const receiver = order.receiver ? `${order.receiver.name} en ${destination}` : `un administrador en ${destination}`;
  switch (order.status) {
    case 'draft':
      return 'Borrador: se edita y se envía desde la web.';
    case 'pending_dispatch':
      return order.dispatcher
        ? `Por sacar: los productos los saca ${order.dispatcher.name} en ${order.sourceWarehouse.name}.`
        : `Por sacar en ${order.sourceWarehouse.name}: falta asignar quién saca (lo hace un administrador en la web).`;
    case 'in_transit':
    case 'partially_received':
    case 'with_differences':
      if (order.pendingReceiptQuantity <= 0) {
        return order.status === 'with_differences'
          ? 'Con diferencias: el administrador las resuelve desde la web.'
          : null;
      }
      if (userId && order.dispatchedBy?.id === userId) {
        return `Sacaste los productos de este traslado: lo recibe ${receiver}.`;
      }
      if (userId && order.carrier?.id === userId) {
        return `Transportas este traslado: al llegar, ${receiver} confirma la recepción.`;
      }
      return `Lo recibe ${receiver}.`;
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
