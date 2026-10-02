/** Rutas de Bodegas (puras). */

/** `/bodega/<id>?nombre=<nombre>`: el nombre sirve de título mientras carga. */
export function warehouseDetailHref(warehouse: { id: string; name: string }): string {
  return `/bodega/${encodeURIComponent(warehouse.id)}?nombre=${encodeURIComponent(warehouse.name)}`;
}

export function transferDetailHref(transferOrderId: string): string {
  return `/traslado/${encodeURIComponent(transferOrderId)}`;
}

export type WarehouseDetailTab = 'productos' | 'camino' | 'historial';

export function parseWarehouseTabParam(value: unknown): WarehouseDetailTab {
  const text = Array.isArray(value) ? value[0] : value;
  return text === 'camino' || text === 'historial' ? text : 'productos';
}
