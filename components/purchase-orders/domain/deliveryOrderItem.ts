import { DeliveryOrderItem } from '../types';

/**
 * Línea de orden de entrega tal como llega de cualquier origen (tabla con RLS o
 * RPC autorizado). Las cantidades llegan como `numeric`, así que pueden venir
 * nulas o como texto según el driver.
 */
export interface DeliveryOrderItemSource {
  id: string;
  product_id: string;
  product_name: string | null;
  product_sku: string | null;
  product_barcode: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  quantity: number | string | null;
  delivered_quantity: number | string | null;
  notes?: string | null;
}

/**
 * Normaliza una línea y deriva su progreso. Es la única fuente del cálculo de
 * pendiente/completo, para que la lista de productos diga lo mismo venga de
 * "Todas las órdenes" o de "Mis órdenes".
 */
export function toDeliveryOrderItem(source: DeliveryOrderItemSource): DeliveryOrderItem {
  const quantity = Number(source.quantity) || 0;
  const deliveredQuantity = Number(source.delivered_quantity) || 0;
  const pendingQuantity = Math.max(quantity - deliveredQuantity, 0);
  const notes = typeof source.notes === 'string' && source.notes.trim() ? source.notes.trim() : null;

  return {
    id: source.id,
    product_id: source.product_id,
    product_name: source.product_name || 'Producto sin nombre',
    product_sku: source.product_sku || null,
    product_barcode: source.product_barcode || null,
    warehouse_id: source.warehouse_id,
    warehouse_name: source.warehouse_name || null,
    quantity,
    delivered_quantity: deliveredQuantity,
    pending_quantity: pendingQuantity,
    is_complete: pendingQuantity === 0,
    notes,
  };
}
