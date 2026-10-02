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

/**
 * Traslados (órdenes de traslado con recepción confirmada, 3.3.0).
 *
 * No depende solo del rol: el servidor decide por bodega. Despacha el
 * admin/bodeguero o un responsable de despacho de la bodega origen; recibe el
 * admin o un responsable de recibir de la bodega destino (`warehouse_members`),
 * y el transportador ve lo que lleva. Por eso entra al módulo:
 * - admin o bodeguero, siempre;
 * - quien sea miembro de alguna bodega (`get_my_warehouse_memberships`);
 * - quien tenga alguna tarea pendiente (`get_my_transfer_tasks`), p. ej. el
 *   transportador sin bodega asignada.
 */
export type TransferAccessInput = {
  roleNames: readonly string[];
  /** Bodegas donde el usuario es responsable (despachar o recibir). */
  membershipsCount: number;
  /** Tareas pendientes (por despachar, recibir, transportar o confirmar). */
  tasksCount: number;
};

export function canUseTransfersFor({ roleNames, membershipsCount, tasksCount }: TransferAccessInput): boolean {
  const roles = new Set(roleNames.map((name) => name.trim().toLowerCase()));
  if (roles.has('admin') || roles.has('bodeguero')) return true;
  return membershipsCount > 0 || tasksCount > 0;
}

/**
 * Bodegas (3.4.0; migración 20261231390000): el encargado de una bodega es su
 * Responsable (`warehouse_members`). El admin ve todas; cualquier otro usuario
 * —también el bodeguero— solo las bodegas de las que es Responsable, así que
 * un bodeguero sin bodega asignada no ve ninguna y no se le muestra la tarjeta.
 */
export type WarehousesAccessInput = {
  roleNames: readonly string[];
  /** Bodegas de las que es Responsable (`get_my_warehouse_memberships` o `list_my_warehouses`). */
  membershipsCount: number;
};

export function canUseWarehousesFor({ roleNames, membershipsCount }: WarehousesAccessInput): boolean {
  const roles = new Set(roleNames.map((name) => name.trim().toLowerCase()));
  return roles.has('admin') || membershipsCount > 0;
}
