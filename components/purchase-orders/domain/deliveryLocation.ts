/** Ubicación de entrega de una orden de tipo cliente.
 *
 *  `address` es la dirección de la vivienda en texto libre; el resto sale de los
 *  maestros (departamento → municipio → vereda). Todas las piezas son
 *  opcionales: hay órdenes anteriores a la ubicación estructurada, remisiones
 *  que se localizan por zona, y municipios sin veredas cargadas.
 */
export interface DeliveryLocationParts {
  departamento_name?: string | null;
  municipio_name?: string | null;
  vereda_name?: string | null;
  delivery_address?: string | null;
}

function clean(value?: string | null): string {
  return (value ?? '').trim();
}

/** "La Playa, Rionegro, Antioquia" — de lo más específico a lo más general.
 *  Mismo orden que en el web para que las dos pantallas se lean igual. */
export function formatDeliveryLocation(parts: DeliveryLocationParts): string {
  return [parts.vereda_name, parts.municipio_name, parts.departamento_name]
    .map(clean)
    .filter(Boolean)
    .join(', ');
}

/** Ubicación y dirección de la vivienda en una sola línea. */
export function formatDeliveryAddressLine(parts: DeliveryLocationParts): string {
  return [formatDeliveryLocation(parts), clean(parts.delivery_address)].filter(Boolean).join(' — ');
}

/** Filtro de ubicación del listado. '' en cualquier nivel = sin filtrar. */
export interface DeliveryLocationFilter {
  departamentoId: string;
  municipioId: string;
  veredaId: string;
}

export const EMPTY_DELIVERY_LOCATION_FILTER: DeliveryLocationFilter = {
  departamentoId: '',
  municipioId: '',
  veredaId: '',
};

export function isDeliveryLocationFilterActive(filter: DeliveryLocationFilter): boolean {
  return Boolean(filter.departamentoId || filter.municipioId || filter.veredaId);
}

/** Cuántos niveles trae puestos el filtro: alimenta el contador del botón. */
export function countActiveLocationFilters(filter: DeliveryLocationFilter): number {
  return [filter.departamentoId, filter.municipioId, filter.veredaId].filter(Boolean).length;
}

/** La orden, vista por el filtro: sus ids de ubicación.
 *  `departamentoId` se deduce del municipio, no se guarda en la orden. */
export interface DeliveryLocationIds {
  departamento_id?: string | null;
  municipio_id?: string | null;
  vereda_id?: string | null;
}

/** ¿La orden pasa el filtro?
 *
 *  Cada nivel puesto tiene que coincidir exactamente. Una orden sin ubicación
 *  (remisión, o de las anteriores al maestro) queda fuera en cuanto el filtro
 *  pide algo: es justo lo que se busca al filtrar por un municipio. */
export function matchesDeliveryLocation(
  order: DeliveryLocationIds,
  filter: DeliveryLocationFilter,
): boolean {
  if (filter.departamentoId && order.departamento_id !== filter.departamentoId) return false;
  if (filter.municipioId && order.municipio_id !== filter.municipioId) return false;
  if (filter.veredaId && order.vereda_id !== filter.veredaId) return false;
  return true;
}
