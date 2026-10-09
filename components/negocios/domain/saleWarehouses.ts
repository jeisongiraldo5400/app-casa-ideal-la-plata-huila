/**
 * Bodegas de venta (3.5.0): de qué bodegas puede vender cada usuario al crear
 * un negocio con origen «desde bodega».
 *
 * - Admin: sin restricción.
 * - Los demás: solo las bodegas que el admin le asignó (`warehouse_sellers`).
 *   Sin ninguna asignada no ve ninguna.
 * - Mientras no se sepa (sin caché y sin respuesta del servidor) se trata como
 *   restringido y vacío: es preferible no mostrar nada que mostrar todo.
 *
 * Con remisión u orden de entrega como origen no aplica: la bodega la trae la
 * orden. Las pantallas y servicios reciben el acceso como parámetro.
 */
export type SaleWarehouseAccess =
  | { restricted: false }
  | { restricted: true; allowedIds: readonly string[] };

export const UNRESTRICTED_SALE_ACCESS: SaleWarehouseAccess = { restricted: false };

export const SIN_BODEGAS_DE_VENTA =
  'No tienes bodegas asignadas para vender. Pídele al administrador que te asigne.';

export const BODEGAS_DE_VENTA_NO_CARGADAS =
  'No se pudieron cargar tus bodegas de venta. Conéctate y vuelve a intentarlo.';

/** Acceso a partir de lo que respondió el servidor (o la caché). */
export function saleAccessFor(input: {
  isAdmin: boolean;
  warehouseIds: readonly string[] | null;
}): SaleWarehouseAccess {
  if (input.isAdmin) return UNRESTRICTED_SALE_ACCESS;
  return { restricted: true, allowedIds: [...new Set(input.warehouseIds ?? [])] };
}

/** Ids permitidos o null si no hay restricción. */
export function allowedSaleWarehouseIds(
  access: SaleWarehouseAccess | null | undefined
): readonly string[] | null {
  if (!access || !access.restricted) return null;
  return access.allowedIds;
}

/** ¿Puede vender desde esta bodega? Sin acceso definido no se restringe. */
export function saleWarehouseAllowed(
  access: SaleWarehouseAccess | null | undefined,
  warehouseId: string | null | undefined
): boolean {
  const allowed = allowedSaleWarehouseIds(access);
  if (allowed === null) return true;
  return Boolean(warehouseId) && allowed.includes(warehouseId as string);
}

/** Restringido y sin ninguna bodega: no hay nada que buscar. */
export function hasNoSaleWarehouses(access: SaleWarehouseAccess | null | undefined): boolean {
  const allowed = allowedSaleWarehouseIds(access);
  return allowed !== null && allowed.length === 0;
}

/** Deja solo las filas de existencias de bodegas permitidas. */
export function filterStockRows<T extends { warehouse_id: string }>(
  rows: readonly T[],
  access: SaleWarehouseAccess | null | undefined
): T[] {
  if (allowedSaleWarehouseIds(access) === null) return [...rows];
  return rows.filter((row) => saleWarehouseAllowed(access, row.warehouse_id));
}

/** Igual que `filterStockRows`, para el mapa producto → existencias. */
export function filterStockMap<T extends { warehouse_id: string }>(
  map: Record<string, readonly T[]>,
  access: SaleWarehouseAccess | null | undefined
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(map).map(([productId, rows]) => [productId, filterStockRows(rows, access)])
  );
}

export function itemWarehouseAllowed(
  item: { warehouse_id: string },
  access: SaleWarehouseAccess | null | undefined
): boolean {
  return saleWarehouseAllowed(access, item.warehouse_id);
}

/**
 * Mensaje de error si alguna línea sale de una bodega no permitida, o null.
 * Protege contra un formulario armado antes de la asignación o que quedó
 * abierto mientras el admin quitaba una bodega.
 */
export function saleWarehouseItemsError(
  items: readonly { warehouse_id: string; description?: string | null }[],
  access: SaleWarehouseAccess | null | undefined
): string | null {
  if (hasNoSaleWarehouses(access) && items.length) return SIN_BODEGAS_DE_VENTA;
  const blocked = items.find((item) => !itemWarehouseAllowed(item, access));
  if (!blocked) return null;
  const name = blocked.description?.trim() || 'Un producto';
  return `«${name}» sale de una bodega de la que no puedes vender. Quítalo y agrégalo desde una de tus bodegas de venta.`;
}
