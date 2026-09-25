import type { Database } from '@nozbe/watermelondb';
import { getMeta, setMeta } from './outbox';
import { cursorFromServerTime } from './types';
import type { SyncReason } from './syncEngine';

/**
 * Cuándo se baja el catálogo de producto (productos, bodegas y existencias).
 *
 * Pesa ~1,4 MB en la primera bajada y sólo lo usa el asistente de creación de
 * negocio sin señal, así que NO viaja en cada sincronización. Viaja cuando:
 *
 *   1. la persona lo pide: pulsa «Descargar información» (`reason` 'manual')
 *      o abre el asistente de negocio con señal (`requestCatalogOnNextSync`);
 *   2. ya está descargado pero tiene más de un día: así las existencias que se
 *      ven sin señal no envejecen indefinidamente.
 *
 * Un usuario que nunca crea negocios (un gestor de cobro, por ejemplo) nunca
 * paga esos megas, porque sin una petición explícita el punto 2 no se cumple.
 */
export const CATALOG_CURSOR_META_KEY = 'catalog_last_pulled_at';
export const CATALOG_PULLED_AT_META_KEY = 'catalog_pulled_at_ms';
export const CATALOG_PAYLOAD_VERSION_META_KEY = 'catalog_payload_version';

/** Versión de los campos del catálogo que se guardan; subirla fuerza bajarlo entero. */
export const CATALOG_PAYLOAD_VERSION = '1';

/** Un día: pasado ese tiempo la descarga normal vuelve a traer el catálogo. */
export const CATALOG_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Petición puntual desde una pantalla (el asistente de negocio). Vive en
 * memoria: si la app se cierra antes de sincronizar, no queda nada pendiente.
 */
let catalogRequested = false;

export function requestCatalogOnNextSync() {
  catalogRequested = true;
}

export function isCatalogRequested() {
  return catalogRequested;
}

export function clearCatalogRequest() {
  catalogRequested = false;
}

/** Lo que llevaba la sincronización en curso cuando arrancó. */
export type InFlightSyncMeta = { reason: SyncReason; catalogRequested: boolean };

/**
 * ¿Hay que sincronizar otra vez cuando termine la que está en curso?
 *
 * Una sincronización automática (al volver la señal, al abrir la app, tras un
 * cobro) decide al arrancar si pide el catálogo. Si la persona pulsa
 * «Descargar información», o el asistente de negocio pide el catálogo, justo
 * mientras corre una de ésas, antes se colgaba de ella: la hora de «Datos
 * actualizados» avanzaba pero productos y existencias seguían siendo los de
 * ayer, y el asistente mostraba la hora vieja.
 */
export function mustRerunAfterInFlight(input: {
  inFlight: InFlightSyncMeta;
  reason: SyncReason;
  catalogRequested: boolean;
}): boolean {
  // Una manual ya trae el catálogo: cualquier petición queda cubierta.
  if (input.inFlight.reason === 'manual') return false;
  if (input.reason === 'manual') return true;
  return input.catalogRequested && !input.inFlight.catalogRequested;
}

export function shouldIncludeCatalog(input: {
  reason: SyncReason;
  requested: boolean;
  /** Momento de la última descarga del catálogo; null si nunca se bajó. */
  lastCatalogAt: number | null;
  now?: number;
}): boolean {
  if (input.requested) return true;
  if (input.reason === 'manual') return true;
  if (!input.lastCatalogAt) return false;
  return (input.now ?? Date.now()) - input.lastCatalogAt >= CATALOG_REFRESH_MS;
}

/**
 * Cursor propio del catálogo. El cursor general avanza en cada sincronización,
 * así que reutilizarlo dejaría el catálogo vacío para siempre: la primera vez
 * que se pidiera, el servidor contestaría «sin novedades desde hace un minuto».
 */
export async function getCatalogCursor(database: Database): Promise<string | null> {
  const version = await getMeta(database, CATALOG_PAYLOAD_VERSION_META_KEY);
  if (version !== CATALOG_PAYLOAD_VERSION) return null;
  return getMeta(database, CATALOG_CURSOR_META_KEY);
}

/**
 * Cursor con el que se pide un paquete que trae el catálogo: el más viejo de
 * los dos, y `null` (bajada completa) si cualquiera de ellos lo es.
 *
 * Antes se usaba el del catálogo tal cual. Si la app se actualizaba con una
 * versión nueva del paquete (el cursor general vuelve a `null` para bajar todo
 * otra vez) y la primera sincronización traía el catálogo, se pedía desde el
 * cursor del catálogo: los negocios viejos nunca recibían los campos nuevos.
 */
export function cursorForCatalogPull(
  generalCursor: string | null,
  catalogCursor: string | null
): string | null {
  if (!generalCursor || !catalogCursor) return null;
  return Date.parse(catalogCursor) < Date.parse(generalCursor) ? catalogCursor : generalCursor;
}

export async function getCatalogPulledAt(database: Database): Promise<number | null> {
  const raw = await getMeta(database, CATALOG_PULLED_AT_META_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function markCatalogPulled(
  database: Database,
  serverTime: string,
  now = Date.now()
) {
  await setMeta(database, CATALOG_CURSOR_META_KEY, cursorFromServerTime(serverTime));
  await setMeta(database, CATALOG_PULLED_AT_META_KEY, String(now));
  await setMeta(database, CATALOG_PAYLOAD_VERSION_META_KEY, CATALOG_PAYLOAD_VERSION);
}
