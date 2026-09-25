import NetInfo from '@react-native-community/netinfo';
import { isNetInfoOnline } from '../network';
import { useSyncStore } from '../store/syncStore';
import { CATALOG_REFRESH_MS, requestCatalogOnNextSync } from './catalogPull';
import { canUseLocalCatalog, localCatalogPulledAt } from '../repositories/catalogRepository';
import { runSync } from './syncEngine';

export { isNetInfoOnline };

export type ManualDownloadResult =
  | { ok: true }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'error'; message: string };

export async function requestManualDownload(): Promise<ManualDownloadResult> {
  const net = await NetInfo.fetch();
  const online = isNetInfoOnline(net);
  useSyncStore.getState().setOnline(online);
  if (!online) {
    useSyncStore.getState().setStatus('offline');
    return { ok: false, reason: 'offline' };
  }
  await runSync('manual');
  const lastError = useSyncStore.getState().lastError;
  if (lastError) {
    return { ok: false, reason: 'error', message: lastError };
  }
  return { ok: true };
}

/**
 * Asegura que el catálogo de producto esté en el teléfono, sin castigar la red.
 *
 * Lo llama el asistente de creación de negocio al abrirse: si el catálogo
 * falta o ya tiene más de un día y hay señal, se pide en una sincronización;
 * si está al día o no hay red, no hace nada (y el asistente trabaja con lo que
 * haya descargado). Devuelve true si lanzó la descarga.
 */
export async function ensureCatalogForOffline(): Promise<boolean> {
  if (!canUseLocalCatalog()) return false;
  const pulledAt = await localCatalogPulledAt();
  if (pulledAt && Date.now() - pulledAt < CATALOG_REFRESH_MS) return false;
  const net = await NetInfo.fetch();
  if (!isNetInfoOnline(net)) return false;
  requestCatalogOnNextSync();
  await runSync('mutation');
  return true;
}

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Hora de una descarga. Si no es de hoy lo dice («ayer 12:54 p. m.», «23 sep.
 * 12:54 p. m.»): sólo con la hora, una descarga de ayer parecía de hoy y se
 * creaba un negocio sin señal creyendo que las existencias estaban al día.
 */
export function formatLastDownloadTime(lastSyncedAt: number | null, now = Date.now()) {
  if (!lastSyncedAt) return null;
  const time = new Date(lastSyncedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const days = Math.round((startOfDay(now) - startOfDay(lastSyncedAt)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `ayer ${time}`;
  const date = new Date(lastSyncedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return `${date} ${time}`;
}

/** Margen para no avisar de un catálogo que bajó en la misma sincronización. */
const CATALOG_LAG_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Aviso de que productos y existencias son más viejos que el resto de los
 * datos. `null` si están al día o nunca se bajaron (quien no crea negocios no
 * los necesita).
 */
export function catalogLagLabel(
  lastSyncedAt: number | null,
  catalogAt: number | null,
  now = Date.now()
): string | null {
  if (!lastSyncedAt || !catalogAt) return null;
  if (lastSyncedAt - catalogAt < CATALOG_LAG_TOLERANCE_MS) return null;
  return `Productos y existencias · ${formatLastDownloadTime(catalogAt, now)}`;
}

export function formatLocalDataLabel(lastSyncedAt: number | null) {
  const time = formatLastDownloadTime(lastSyncedAt);
  return time ? `Datos locales · última descarga ${time}` : 'Datos locales';
}
