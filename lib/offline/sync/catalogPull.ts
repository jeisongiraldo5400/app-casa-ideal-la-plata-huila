import type { Database } from '@nozbe/watermelondb';
import { getMeta, setMeta } from './outbox';
import { cursorFromServerTime } from './types';
import type { SyncReason } from './syncEngine';

/**
 * Cuándo se baja el catálogo de producto (productos, bodegas y existencias).
 *
 * Desde la descarga selectiva v2 (2026-09-25) NADA baja solo: el catálogo
 * viaja únicamente cuando la persona pulsa «Descargar» y tiene productos en
 * modo «todo». Se quitaron la petición del asistente de negocio y el refresco
 * automático de 24 h.
 */
export const CATALOG_CURSOR_META_KEY = 'catalog_last_pulled_at';
export const CATALOG_PULLED_AT_META_KEY = 'catalog_pulled_at_ms';
export const CATALOG_PAYLOAD_VERSION_META_KEY = 'catalog_payload_version';

/** Versión de los campos del catálogo que se guardan; subirla fuerza bajarlo entero. */
export const CATALOG_PAYLOAD_VERSION = '1';

/** Lo que llevaba la sincronización en curso cuando arrancó. */
export type InFlightSyncMeta = { reason: SyncReason };

/** ¿Esta sincronización descarga? Solo «Descargar»; las demás solo suben la cola. */
export function isDownloadReason(reason: SyncReason): boolean {
  return reason === 'manual';
}

/**
 * ¿Hay que sincronizar otra vez cuando termine la que está en curso? Sólo si
 * la persona pulsó «Descargar» mientras corría una subida automática: esa no
 * baja nada, así que colgarse de ella dejaría la descarga sin hacer.
 */
export function mustRerunAfterInFlight(input: { inFlight: InFlightSyncMeta; reason: SyncReason }): boolean {
  return isDownloadReason(input.reason) && !isDownloadReason(input.inFlight.reason);
}

/**
 * ¿Viaja el catálogo en esta sincronización?
 *
 * - Sólo en una descarga manual.
 * - Nunca al recaudador puro (alcance 'cobro'): el servidor no se lo manda.
 * - Con productos en «ninguno» no se pide… salvo que la persona haya cambiado
 *   sus elecciones desde la última descarga: puede haber vuelto a «todo» y el
 *   teléfono todavía no lo sabe.
 */
export function shouldIncludeCatalog(input: {
  reason: SyncReason;
  scope: string | null;
  productsMode: string | null;
  choicesChanged: boolean;
}): boolean {
  if (!isDownloadReason(input.reason)) return false;
  if (input.scope === 'cobro') return false;
  if (input.productsMode === 'ninguno' && !input.choicesChanged) return false;
  return true;
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

/**
 * Olvida la descarga del catálogo (productos en «ninguno»): la próxima vez que
 * se pida vuelve a bajar entero en vez de pedir sólo lo cambiado desde una
 * fecha en la que el teléfono ya no guarda nada.
 */
export async function forgetCatalogPull(database: Database) {
  await setMeta(database, CATALOG_CURSOR_META_KEY, '');
  await setMeta(database, CATALOG_PULLED_AT_META_KEY, '');
  await setMeta(database, CATALOG_PAYLOAD_VERSION_META_KEY, 'borrado');
}
