/**
 * Qué operaciones de almacén puede usar cada rol, según lo que exige el servidor.
 *
 * - Entradas: `register_inventory_entries_batch` exige `is_admin_or_bodeguero()`.
 * - Órdenes de compra: la RLS de `purchase_orders` solo deja leer a admin y
 *   bodeguero (20260808200000); a los demás la lista y el conteo les llegan vacíos.
 * - Salidas: admin y bodeguero registran cualquier orden; el resto solo las
 *   órdenes donde tiene asignación de recogida (`delivery_order_pickup_assignments`,
 *   ver exitAuthorization). Esas asignaciones las recibe el vendedor dueño del
 *   negocio al activarlo o reasignarlo, así que vendedor y gestor pueden tener
 *   salidas propias. «Mis órdenes» lista exactamente esas asignaciones.
 * - Todas las órdenes (entrega): cualquier usuario autenticado puede leerlas
 *   (`get_delivery_orders_page`, RLS de 20261123120000).
 */
export type WarehouseAccess = {
  canRegisterEntries: boolean;
  canReadPurchaseOrders: boolean;
  /** Registra salidas de cualquier orden (sin asignación). */
  canRegisterAnyExit: boolean;
  /** Ve Salidas y Mis órdenes: registra todas o las que le asignaron. */
  canUseExits: boolean;
  canSeeAllOrders: boolean;
};

export function warehouseAccessFor(roleNames: readonly string[]): WarehouseAccess {
  const roles = new Set(roleNames.map((name) => name.trim().toLowerCase()));
  const operational = roles.has('admin') || roles.has('bodeguero');
  const receivesPickupAssignments = roles.has('vendedor') || roles.has('gestor de cobro');
  return {
    canRegisterEntries: operational,
    canReadPurchaseOrders: operational,
    canRegisterAnyExit: operational,
    canUseExits: operational || receivesPickupAssignments,
    canSeeAllOrders: roles.size > 0,
  };
}

/** Aviso en Salidas para quien solo registra las órdenes asignadas. */
export const ASSIGNED_EXITS_ONLY_MESSAGE =
  'Solo puedes registrar salidas de las órdenes que te asignaron para recoger (las ves en «Mis órdenes»). ' +
  'Si eliges otra, la app te avisará antes de escanear.';
