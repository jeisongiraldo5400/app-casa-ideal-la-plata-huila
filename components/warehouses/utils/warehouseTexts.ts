/** Textos de Bodegas en la app (puros; se prueban sin React). */
import type { WarehouseSummary } from './warehouseModel';
import { formatUnits } from './warehouseHistory';

const plural = (count: number, singular: string, pluralForm: string) => (count === 1 ? singular : pluralForm);

/** «12 productos · 340 unidades». */
export function stockSummaryText(warehouse: Pick<WarehouseSummary, 'totalProducts' | 'totalUnits'>): string {
  return (
    `${formatUnits(warehouse.totalProducts)} ${plural(warehouse.totalProducts, 'producto', 'productos')} · ` +
    `${formatUnits(warehouse.totalUnits)} ${plural(warehouse.totalUnits, 'unidad', 'unidades')}`
  );
}

/** «2 en camino» (traslados que llegan); null si no hay. */
export function incomingText(warehouse: Pick<WarehouseSummary, 'incomingTransfers'>): string | null {
  return warehouse.incomingTransfers > 0 ? `${warehouse.incomingTransfers} en camino` : null;
}

/** «1 por despachar» (traslados que salen); null si no hay. */
export function pendingDispatchText(warehouse: Pick<WarehouseSummary, 'pendingDispatch'>): string | null {
  return warehouse.pendingDispatch > 0 ? `${warehouse.pendingDispatch} por despachar` : null;
}

/** «Encargados: Ana, Luis» / «Sin encargado». */
export function managersText(managers: readonly string[]): string {
  if (managers.length === 0) return 'Sin encargado asignado';
  return `${managers.length === 1 ? 'Encargado' : 'Encargados'}: ${managers.join(', ')}`;
}

export const EMPTY_WAREHOUSES_MESSAGE =
  'No tienes bodegas asignadas. Pide al administrador que te asigne como responsable.';

export const OFFLINE_WAREHOUSES_MESSAGE =
  'Sin señal: la información puede estar desactualizada. Las bodegas se consultan con conexión.';

export const WAREHOUSES_UNAVAILABLE_MESSAGE =
  'El servidor todavía no tiene la consulta de bodegas. Pide a un administrador que lo actualice.';
