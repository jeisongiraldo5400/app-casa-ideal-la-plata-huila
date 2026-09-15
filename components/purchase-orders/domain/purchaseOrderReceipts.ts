/**
 * Recepciones de una orden de compra.
 *
 * Recibido = entradas `PO_ENTRY` no borradas, el mismo criterio del servidor
 * (`fn_guard_purchase_order_status_transition`, `register_inventory_entries_batch`
 * y `get_purchase_orders_dashboard` desde 20261026120000). Las devoluciones a
 * proveedor se registran como `inventory_entries` con `entry_type = 'return'` y
 * el mismo `purchase_order_id`, con cantidad positiva: sumarlas mostraba la
 * orden más cerca de completarse de lo que está y ocultaba unidades por recibir
 * (BUG-R-SC-2).
 */
export const PURCHASE_ORDER_RECEIPT_ENTRY_TYPE = 'PO_ENTRY';

export function isPurchaseOrderReceipt(entry: { entry_type?: string | null }): boolean {
  return entry.entry_type === PURCHASE_ORDER_RECEIPT_ENTRY_TYPE;
}
