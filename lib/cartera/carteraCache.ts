import type { CarteraQuery } from './types';

/**
 * Frescura de los datos de Cartera entre enfoques de la pantalla.
 *
 * La pestaña conserva su estado, así que volver a ella (cambiar de pestaña,
 * cerrar un modal, volver de otra pantalla) disparaba antes una recarga
 * completa: listado + tablero + mora. Aquí se recuerda qué se cargó y cuándo,
 * para reutilizarlo mientras siga siendo reciente.
 *
 * Es un módulo sin dependencias (ni React ni Supabase): la marca vive fuera del
 * componente para sobrevivir a un remontaje de la pantalla, y las reglas se
 * pueden probar como funciones puras.
 */

/** Ventana durante la que se reutiliza lo ya cargado, igual que en catálogos. */
export const CARTERA_CACHE_TTL_MS = 30_000;

export type CarteraCacheStamp = {
  /** Epoch ms de la última carga completa exitosa. */
  loadedAt: number;
  /** Filtros con los que se cargó: si cambian, lo guardado no sirve. */
  key: string;
  /** Algo cambió desde entonces (un pago, p. ej.) y hay que volver a pedir. */
  stale: boolean;
};

/**
 * Identidad de una consulta: los filtros que viajan al servidor. Dos cargas con
 * la misma clave devuelven lo mismo; con claves distintas hay que volver a pedir.
 */
export function carteraFiltersKey(filters: CarteraQuery): string {
  return JSON.stringify([
    filters.filter,
    filters.search,
    filters.days,
    filters.municipioId,
    filters.customerSellerId || '',
    filters.paymentMethodId || '',
    filters.gestorId || '',
    filters.dueFrom || '',
    filters.dueTo || '',
  ]);
}

/**
 * ¿Hay que volver a pedir listado y tablero? Sí cuando no hay nada cargado,
 * cuando los filtros cambiaron, cuando algo se invalidó o cuando lo cargado ya
 * envejeció. El «tirar para refrescar» y el botón de recargar no pasan por aquí:
 * fuerzan la carga siempre.
 */
export function needsCarteraRefresh(
  stamp: CarteraCacheStamp | null,
  key: string,
  now: number,
  ttlMs: number = CARTERA_CACHE_TTL_MS
): boolean {
  if (!stamp) return true;
  if (stamp.stale) return true;
  if (stamp.key !== key) return true;
  return now - stamp.loadedAt > ttlMs;
}

let stamp: CarteraCacheStamp | null = null;

export function getCarteraStamp(): CarteraCacheStamp | null {
  return stamp;
}

/** Tras una carga completa exitosa. */
export function markCarteraLoaded(key: string, now: number = Date.now()): void {
  stamp = { loadedAt: now, key, stale: false };
}

/**
 * Los datos dejaron de valer: la próxima vez que se enfoque la pantalla se
 * vuelven a pedir. Lo usa la propia pantalla al abrir el detalle de un negocio,
 * porque allí se registran y se anulan pagos.
 */
export function invalidateCartera(): void {
  if (stamp) stamp = { ...stamp, stale: true };
}

/** Solo para pruebas: deja el módulo como recién importado. */
export function resetCarteraCache(): void {
  stamp = null;
}
