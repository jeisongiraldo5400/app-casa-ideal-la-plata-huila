import type { Database } from '@nozbe/watermelondb';
import { getDatabase, isDatabaseOpen } from '../database';
import { getMeta, setMeta } from './outbox';
import {
  SELECTIVE_DOMAINS,
  type PullPayload,
  type PullSyncConfig,
  type SelectiveDomain,
  type SyncDomainMode,
} from './types';

/**
 * «Preparar el teléfono» (descarga selectiva v2) tal como lo conoce el teléfono.
 *
 * El servidor es la fuente de verdad (`mobile_sync_prefs`). Cada descarga
 * manual devuelve `sync_config` y aquí se guarda en `sync_meta`: es «lo que
 * hay en el teléfono». Si la persona cambia sus elecciones después, la
 * pantalla muestra «Pendiente de descargar» hasta que pulse «Descargar»; nada
 * baja solo.
 *
 * `domain_rev:<d>` guarda la revisión de cada dominio que ya se aplicó
 * completa (con su purga), tal como pide el contrato.
 */
export const SYNC_CONFIG_META_KEY = 'sync_config_json';
export const DOMAIN_REV_META_PREFIX = 'domain_rev:';
/** 'true' | 'false': si el servidor conoce `p_options`. Ausente = aún no se sabe. */
export const SELECTIVE_SUPPORTED_META_KEY = 'selective_supported';
/** Última vez (ms) que se comprobó que el servidor NO conoce `p_options`. */
export const SELECTIVE_CHECKED_AT_META_KEY = 'selective_checked_at';
/** Momento (ms) de la última descarga manual que terminó bien. */
export const LAST_MANUAL_DOWNLOAD_META_KEY = 'last_manual_download_at';
/** Momento (ms) en que la persona cambió sus elecciones desde este teléfono. */
export const CHOICES_CHANGED_AT_META_KEY = 'choices_changed_at';

/**
 * Con un servidor sin `p_options` no se insiste en cada descarga: se vuelve a
 * probar al día siguiente. Como ahora sólo se descarga a mano, basta con eso.
 */
export const SELECTIVE_RECHECK_MS = 24 * 60 * 60 * 1000;

export type LocalDomainConfig = { mode: SyncDomainMode; revision: number; count: number | null };

export type LocalSyncConfig = {
  /** 'todo' | 'seleccion'. */
  clientes: LocalDomainConfig;
  /** 'todo' | 'ninguno' (v2: ya no hay selección por producto). */
  productos: LocalDomainConfig;
  ordenes: { revision: number; count: number | null };
  /** Municipios elegidos para clientes (v2); `null` si el servidor no lo manda. */
  municipios: { revision: number; count: number | null } | null;
};

function toInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toCount(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normaliza el `sync_config` del servidor. `null` si no vino. */
export function parseSyncConfig(raw: PullSyncConfig | null | undefined): LocalSyncConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    clientes: {
      mode: raw.clientes?.mode === 'seleccion' ? 'seleccion' : 'todo',
      revision: toInt(raw.clientes?.revision, 0),
      count: toCount(raw.clientes?.count),
    },
    productos: {
      mode: raw.productos?.mode === 'ninguno' ? 'ninguno' : 'todo',
      revision: toInt(raw.productos?.revision, 0),
      count: toCount(raw.productos?.count),
    },
    ordenes: { revision: toInt(raw.ordenes?.revision, 0), count: toCount(raw.ordenes?.count) },
    municipios: raw.municipios
      ? { revision: toInt(raw.municipios.revision, 0), count: toCount(raw.municipios.count) }
      : null,
  };
}

export async function readSyncConfig(database: Database): Promise<LocalSyncConfig | null> {
  const raw = await getMeta(database, SYNC_CONFIG_META_KEY);
  if (!raw) return null;
  try {
    return parseSyncConfig(JSON.parse(raw) as PullSyncConfig);
  } catch {
    return null;
  }
}

export async function saveSyncConfig(database: Database, config: LocalSyncConfig) {
  await setMeta(database, SYNC_CONFIG_META_KEY, JSON.stringify(config));
}

export type AppliedRevisions = Record<SelectiveDomain, number | null>;

export async function readAppliedRevisions(database: Database): Promise<AppliedRevisions> {
  const entries = await Promise.all(
    SELECTIVE_DOMAINS.map(async (domain) => {
      const raw = await getMeta(database, `${DOMAIN_REV_META_PREFIX}${domain}`);
      const parsed = raw == null || raw === '' ? NaN : Number(raw);
      return [domain, Number.isFinite(parsed) ? parsed : null] as const;
    })
  );
  return Object.fromEntries(entries) as AppliedRevisions;
}

/**
 * Dominios que una descarga manual pide completos: SIEMPRE los clientes, para
 * que el teléfono quede sólo con lo elegido (se borra lo que no vino).
 * Productos no hace falta: en «todo» basta el delta del catálogo con su
 * cursor, y en «ninguno» el teléfono borra el catálogo entero.
 */
export function manualFullDomains(): SelectiveDomain[] {
  return ['clientes'];
}

/** Dominios que llegaron completos en este paquete (nombres tal cual). */
export function fullDomainsSentNames(payload: PullPayload): string[] {
  return Array.isArray(payload.full_domains_sent) ? payload.full_domains_sent.map(String) : [];
}

/** Dominios seleccionables que llegaron completos en este paquete. */
export function fullDomainsSent(payload: PullPayload): SelectiveDomain[] {
  const sent = fullDomainsSentNames(payload);
  return SELECTIVE_DOMAINS.filter((domain) => sent.includes(domain));
}

/**
 * Tras un paquete no recortado, los dominios que vinieron completos quedan al
 * día con la revisión del servidor. `productos` además exige que el catálogo
 * haya llegado de verdad en el paquete.
 */
export function domainsToMarkApplied(
  payload: PullPayload,
  input: { catalogApplied: boolean }
): SelectiveDomain[] {
  if (payload.truncated) return [];
  if (!parseSyncConfig(payload.sync_config)) return [];
  return fullDomainsSent(payload).filter(
    (domain) => domain !== 'productos' || input.catalogApplied
  );
}

/**
 * Guarda `sync_config` y, para los dominios ya aplicados completos, su
 * revisión. Devuelve la configuración guardada (o `null` si no vino).
 */
export async function storeSyncConfigFromPayload(
  database: Database,
  payload: PullPayload,
  input: { catalogApplied: boolean }
): Promise<LocalSyncConfig | null> {
  const config = parseSyncConfig(payload.sync_config);
  if (!config) return null;
  await saveSyncConfig(database, config);
  for (const domain of domainsToMarkApplied(payload, input)) {
    await setMeta(database, `${DOMAIN_REV_META_PREFIX}${domain}`, String(config[domain].revision));
  }
  return config;
}

/** ¿Se envía `p_options` en esta descarga? */
export function shouldSendSelectiveOptions(input: {
  supported: string | null;
  checkedAt: number | null;
  now?: number;
}): boolean {
  if (input.supported !== 'false') return true;
  if (!input.checkedAt) return true;
  return (input.now ?? Date.now()) - input.checkedAt >= SELECTIVE_RECHECK_MS;
}

export async function readSelectiveSupport(database: Database) {
  const supported = await getMeta(database, SELECTIVE_SUPPORTED_META_KEY);
  const rawChecked = await getMeta(database, SELECTIVE_CHECKED_AT_META_KEY);
  const checkedAt = rawChecked ? Number(rawChecked) : NaN;
  return { supported, checkedAt: Number.isFinite(checkedAt) ? checkedAt : null };
}

export async function markSelectiveSupport(database: Database, supported: boolean, now = Date.now()) {
  await setMeta(database, SELECTIVE_SUPPORTED_META_KEY, supported ? 'true' : 'false');
  await setMeta(database, SELECTIVE_CHECKED_AT_META_KEY, String(now));
}

async function readMs(database: Database, key: string): Promise<number | null> {
  const raw = await getMeta(database, key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function markManualDownloadDone(database: Database, now = Date.now()) {
  await setMeta(database, LAST_MANUAL_DOWNLOAD_META_KEY, String(now));
}

/** ¿Cambió la persona sus elecciones en este teléfono después de la última descarga? */
export async function choicesChangedSinceDownload(database: Database): Promise<boolean> {
  const changedAt = await readMs(database, CHOICES_CHANGED_AT_META_KEY);
  if (changedAt == null) return false;
  const downloadedAt = await readMs(database, LAST_MANUAL_DOWNLOAD_META_KEY);
  return downloadedAt == null || changedAt >= downloadedAt;
}

/** Configuración del servidor tal como la da `get_mobile_sync_config` (sólo lo que se compara). */
export type ServerSyncConfigLike = PullSyncConfig | null | undefined;

/**
 * ¿La configuración del servidor difiere de la que se descargó? Compara modo y
 * revisión de cada dominio y, si ambos lo tienen, el conteo (marcar algo no
 * sube la revisión, pero sí el conteo).
 */
export function serverConfigDiffers(
  downloaded: LocalSyncConfig | null,
  server: ServerSyncConfigLike
): boolean {
  const current = parseSyncConfig(server);
  if (!current) return false;
  if (!downloaded) return true;
  const sameCount = (a: number | null, b: number | null) => a == null || b == null || a === b;
  const domains = [
    [downloaded.clientes, current.clientes],
    [downloaded.productos, current.productos],
  ] as const;
  for (const [before, now] of domains) {
    if (before.mode !== now.mode || before.revision !== now.revision) return true;
    if (!sameCount(before.count, now.count)) return true;
  }
  if (downloaded.ordenes.revision !== current.ordenes.revision) return true;
  if (!sameCount(downloaded.ordenes.count, current.ordenes.count)) return true;
  if (downloaded.municipios && current.municipios) {
    if (downloaded.municipios.revision !== current.municipios.revision) return true;
    if (!sameCount(downloaded.municipios.count, current.municipios.count)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// API para las pantallas
// ---------------------------------------------------------------------------

/** Preferencias de la última descarga; `null` sin base local o si nunca llegaron. */
export async function getLocalSyncConfig(): Promise<LocalSyncConfig | null> {
  if (!isDatabaseOpen()) return null;
  return readSyncConfig(getDatabase());
}

/**
 * ¿El servidor sabe hacer descarga selectiva? Sólo es true cuando una descarga
 * con `p_options` salió bien; mientras no se sepa, la pantalla oculta los ajustes.
 */
export async function isSelectiveSyncSupported(): Promise<boolean> {
  if (!isDatabaseOpen()) return false;
  return (await getMeta(getDatabase(), SELECTIVE_SUPPORTED_META_KEY)) === 'true';
}

/** Momento (ms) de la última descarga manual completada; `null` si nunca. */
export async function lastManualDownloadAt(): Promise<number | null> {
  if (!isDatabaseOpen()) return null;
  return readMs(getDatabase(), LAST_MANUAL_DOWNLOAD_META_KEY);
}

/**
 * Lo llama la pantalla tras cada `set_mobile_sync_mode` / `set_mobile_sync_selection`
 * que salió bien: las elecciones cambiaron y todavía no están en el teléfono.
 */
export async function markChoicesChangedLocally(now = Date.now()): Promise<void> {
  if (!isDatabaseOpen()) return;
  await setMeta(getDatabase(), CHOICES_CHANGED_AT_META_KEY, String(now));
}

/**
 * «Hay elecciones pendientes de descargar»: cambió algo desde este teléfono
 * después de la última descarga o, si la pantalla pasa la configuración que
 * acaba de leer del servidor (`get_mobile_sync_config`), ésta no coincide con
 * la descargada (p. ej. se cambió desde otro teléfono).
 */
export async function hasPendingChoicesToDownload(serverConfig?: ServerSyncConfigLike): Promise<boolean> {
  if (!isDatabaseOpen()) return false;
  const database = getDatabase();
  if (await choicesChangedSinceDownload(database)) return true;
  if (serverConfig === undefined) return false;
  return serverConfigDiffers(await readSyncConfig(database), serverConfig);
}
