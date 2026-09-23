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

export function formatLastDownloadTime(lastSyncedAt: number | null) {
  if (!lastSyncedAt) return null;
  return new Date(lastSyncedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatLocalDataLabel(lastSyncedAt: number | null) {
  const time = formatLastDownloadTime(lastSyncedAt);
  return time ? `Datos locales · última descarga ${time}` : 'Datos locales';
}
