import type { StatusTone } from '@/components/ui/StatusChip';

/**
 * Etiquetas y tonos semánticos de los estados de órdenes de compra y de entrega.
 * Mismo patrón que `negocioStatusTone` en `lib/negocioLabels.ts`: la pantalla no decide
 * colores por estado; pide el tono y lo pinta con `StatusChip`.
 */

const DELIVERY_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  sent_by_remission: 'En remisión',
  in_transit: 'En tránsito',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
  returned: 'Devuelta',
};

const DELIVERY_ORDER_STATUS_TONES: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'info',
  sent_by_remission: 'neutral',
  in_transit: 'primary',
  delivered: 'success',
  cancelled: 'error',
  returned: 'warning',
};

export function deliveryOrderStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Pendiente';
  return DELIVERY_ORDER_STATUS_LABELS[status] || status;
}

export function deliveryOrderStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'warning';
  return DELIVERY_ORDER_STATUS_TONES[status] || 'neutral';
}

const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

const PURCHASE_ORDER_STATUS_TONES: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'info',
  received: 'success',
  cancelled: 'error',
};

export function purchaseOrderStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Pendiente';
  return PURCHASE_ORDER_STATUS_LABELS[status] || status;
}

export function purchaseOrderStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'warning';
  return PURCHASE_ORDER_STATUS_TONES[status] || 'neutral';
}
