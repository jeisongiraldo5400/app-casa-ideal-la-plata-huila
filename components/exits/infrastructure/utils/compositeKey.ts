/** Grupo de las líneas propias de una orden (sin `source_delivery_order_id`). */
export const OWN_GROUP_KEY = 'own';

/**
 * Creates a composite key from product_id and warehouse_id.
 * Used throughout the delivery order workflow to correctly distinguish
 * the same product sourced from different warehouses.
 */
export function compositeKey(productId: string, warehouseId: string): string {
  return `${productId}-${warehouseId}`;
}

/**
 * Clave de producto+bodega+grupo. Una remisión puede llevar el mismo producto en sus
 * líneas propias y en la copia de una OE hija: el progreso en sesión y el FIFO se
 * llevan por separado para cada grupo (`OWN_GROUP_KEY` o el id de la OE hija).
 */
export function groupedKey(productId: string, warehouseId: string, groupKey: string = OWN_GROUP_KEY): string {
  return `${compositeKey(productId, warehouseId)}::${groupKey}`;
}
