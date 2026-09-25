/**
 * STUB del paquete D (descarga selectiva). La implementación real es del
 * paquete BC (motor de sincronización); el integrador se queda con la suya y
 * descarta esta. Solo fija la firma que usa la UI:
 *
 * - `getLocalSyncConfig()`: la `sync_config` que el último pull guardó en
 *   `sync_meta.sync_config_json` (o `null` si aún no hay).
 * - `isSelectiveSyncSupported()`: `false` si el motor detectó que el servidor
 *   no conoce `p_options` (`sync_meta.selective_supported = 'false'`).
 */
import { getDatabase, isDatabaseOpen } from '../database';
import { getMeta } from './outbox';

export type LocalSyncMode = 'todo' | 'seleccion';

export type LocalSyncConfig = {
  clientes: { mode: LocalSyncMode; revision: number };
  productos: { mode: LocalSyncMode; revision: number };
  ordenes: { revision: number };
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
