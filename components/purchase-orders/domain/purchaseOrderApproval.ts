/**
 * Solo un administrador aprueba una orden de compra (decisión del usuario,
 * 2026-09-14). El servidor lo exige desde la migración 20261028140000 en
 * fn_guard_purchase_order_status_transition, para cualquier camino. La app no
 * ofrece «Aprobar» (el bodeguero solo marca la OC como recibida); el store
 * rechaza la aprobación de quien no sea admin sin ir al servidor.
 */
export const PURCHASE_ORDER_APPROVAL_ADMIN_ONLY_MESSAGE =
  'Solo un administrador puede aprobar órdenes de compra.';

export function purchaseOrderApprovalAdminOnlyMessage(orderNumber?: string | null): string {
  const label = orderNumber?.trim() || 'sin número';
  return `Solo un administrador puede aprobar la orden de compra ${label}.`;
}

/** Recibe los nombres de rol (p. ej. de useUserRoles) o filas con `nombre`. */
export function canApprovePurchaseOrders(
  roles: ReadonlyArray<string | { nombre?: string | null } | null | undefined> | null | undefined
): boolean {
  return (roles ?? []).some((role) => {
    const name = typeof role === 'string' ? role : role?.nombre;
    return String(name ?? '').trim().toLowerCase() === 'admin';
  });
}
