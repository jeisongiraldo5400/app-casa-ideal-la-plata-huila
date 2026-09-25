import NetInfo from '@react-native-community/netinfo';
import { isNetInfoOnline } from '../network';
import { useSyncStore } from '../store/syncStore';
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
 * Ya no hace nada (descarga selectiva v2): el catálogo sólo baja al pulsar
 * «Descargar». Se conserva porque el asistente de negocio todavía lo llama;
 * cuando deje de hacerlo se puede borrar.
 *
 * @deprecated El catálogo ya no se descarga automáticamente.
 */
export async function ensureCatalogForOffline(): Promise<boolean> {
  return false;
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
