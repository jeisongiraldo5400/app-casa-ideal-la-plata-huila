/**
 * STUB del paquete D (descarga selectiva). La implementación real es del
 * paquete BC (motor de sincronización); el integrador se queda con la suya y
 * descarta esta. Solo fija la firma que usa la UI:
 *
 * - `getLocalSyncConfig()`: la `sync_config` que el último pull guardó en
 *   `sync_meta.sync_config_json` (o `null` si aún no hay).
 * - `isSelectiveSyncSupported()`: `false` si el motor detectó que el servidor
 *   no conoce `p_options` (`sync_meta.selective_supported = 'false'`).
 * - v2: `lastManualDownloadAt()`, `markChoicesChangedLocally()` y
 *   `hasPendingChoicesToDownload(serverConfig?)`.
 */
import { getDatabase, isDatabaseOpen } from '../database';
import { getMeta, setMeta } from './outbox';

export type LocalSyncMode = 'todo' | 'seleccion';

export type LocalSyncConfig = {
  clientes: { mode: LocalSyncMode; revision: number };
  productos: { mode: LocalSyncMode; revision: number };
  ordenes: { revision: number };
  municipios?: { revision: number; count: number | null } | null;
};

export const SYNC_CONFIG_META_KEY = 'sync_config_json';
export const SELECTIVE_SUPPORTED_META_KEY = 'selective_supported';

export async function getLocalSyncConfig(): Promise<LocalSyncConfig | null> {
  if (!isDatabaseOpen()) return null;
  try {
    const raw = await getMeta(getDatabase(), SYNC_CONFIG_META_KEY);
    return raw ? (JSON.parse(raw) as LocalSyncConfig) : null;
  } catch {
    return null;
  }
}

export async function isSelectiveSyncSupported(): Promise<boolean> {
  if (!isDatabaseOpen()) return false;
  try {
    return (await getMeta(getDatabase(), SELECTIVE_SUPPORTED_META_KEY)) !== 'false';
  } catch {
    return false;
  }
}

export const LAST_MANUAL_DOWNLOAD_META_KEY = 'last_manual_download_at';
export const CHOICES_CHANGED_AT_META_KEY = 'choices_changed_at';

/** STUB: en BC es `PullSyncConfig | null | undefined`. */
export type ServerSyncConfigLike = Record<string, unknown> | null | undefined;

async function readMs(key: string): Promise<number | null> {
  if (!isDatabaseOpen()) return null;
  try {
    const raw = await getMeta(getDatabase(), key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** STUB (v2): hora (ms) de la última descarga manual; la escribe el motor (BC). */
export async function lastManualDownloadAt(): Promise<number | null> {
  return readMs(LAST_MANUAL_DOWNLOAD_META_KEY);
}

/** STUB (v2): se llama tras cada `set_mobile_sync_*` que salió bien. */
export async function markChoicesChangedLocally(now = Date.now()): Promise<void> {
  if (!isDatabaseOpen()) return;
  await setMeta(getDatabase(), CHOICES_CHANGED_AT_META_KEY, String(now));
}

/**
 * STUB (v2): ¿hay elecciones pendientes de descargar? La versión de BC además
 * compara `serverConfig` con la configuración descargada.
 */
export async function hasPendingChoicesToDownload(serverConfig?: ServerSyncConfigLike): Promise<boolean> {
  void serverConfig;
  const changedAt = await readMs(CHOICES_CHANGED_AT_META_KEY);
  if (changedAt == null) return false;
  const downloadedAt = await lastManualDownloadAt();
  return downloadedAt == null || changedAt >= downloadedAt;
}
