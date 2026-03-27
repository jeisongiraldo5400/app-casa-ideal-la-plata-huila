/**
 * Creates a composite key from product_id and warehouse_id.
 * Used throughout the delivery order workflow to correctly distinguish
 * the same product sourced from different warehouses.
 */
export function compositeKey(productId: string, warehouseId: string): string {
  return `${productId}-${warehouseId}`;
}
