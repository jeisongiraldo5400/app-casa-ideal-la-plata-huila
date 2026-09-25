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
 * Preferencias de «Qué llevar en el teléfono» tal como las conoce el teléfono.
 *
 * El servidor es la fuente de verdad (`mobile_sync_prefs`); cada pull devuelve
 * `sync_config` y aquí se guarda en `sync_meta` para que las pantallas sepan,
 * sin señal, si un dominio va «Todo» o «Solo lo que elijo».
 *
 * Revisiones: el servidor sube la `revision` de un dominio cuando cambia el
 * modo o se desmarca algo. Lo que el teléfono tiene aplicado se guarda en
 * `domain_rev:<d>`; si no coinciden, el siguiente pull pide ese dominio
 * completo (`full_domains`) para poder borrar lo que ya no se lleva.
 */
export const SYNC_CONFIG_META_KEY = 'sync_config_json';
export const DOMAIN_REV_META_PREFIX = 'domain_rev:';
/** 'true' | 'false': si el servidor conoce `p_options`. Ausente = aún no se sabe. */
export const SELECTIVE_SUPPORTED_META_KEY = 'selective_supported';
/** Última vez (ms) que se comprobó que el servidor NO conoce `p_options`. */
export const SELECTIVE_CHECKED_AT_META_KEY = 'selective_checked_at';

/**
 * Con un servidor sin `p_options` no se insiste en cada sincronización (serían
 * dos peticiones por pull): se vuelve a probar al día siguiente o cuando la
 * persona pulsa «Descargar información».
 */
export const SELECTIVE_RECHECK_MS = 24 * 60 * 60 * 1000;

export type LocalDomainConfig = { mode: SyncDomainMode; revision: number; count: number | null };

export type LocalSyncConfig = {
  clientes: LocalDomainConfig;
  productos: LocalDomainConfig;
  ordenes: { revision: number; count: number | null };
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

function toMode(value: unknown): SyncDomainMode {
  return value === 'seleccion' ? 'seleccion' : 'todo';
}

/** Normaliza el `sync_config` del servidor. `null` si no vino. */
export function parseSyncConfig(raw: PullSyncConfig | null | undefined): LocalSyncConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const domain = (value: PullSyncConfig['clientes']): LocalDomainConfig => ({
    mode: toMode(value?.mode),
    revision: toInt(value?.revision, 0),
    count: toCount(value?.count),
  });
  return {
    clientes: domain(raw.clientes),
    productos: domain(raw.productos),
    ordenes: { revision: toInt(raw.ordenes?.revision, 0), count: toCount(raw.ordenes?.count) },
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
      const parsed = raw == null ? NaN : Number(raw);
      return [domain, Number.isFinite(parsed) ? parsed : null] as const;
    })
  );
  return Object.fromEntries(entries) as AppliedRevisions;
}

/**
 * ¿El teléfono tiene este dominio al día con la revisión del servidor? Sin
 * revisión aplicada (primera descarga con la versión 9, o nunca vino
 * completo) no lo está: hay que pedirlo entero una vez.
 */
export function domainOutOfDate(
  domain: SelectiveDomain,
  config: LocalSyncConfig | null,
  applied: AppliedRevisions
): boolean {
  const appliedRevision = applied[domain];
  if (appliedRevision == null || !config) return true;
  return config[domain].revision !== appliedRevision;
}

/**
 * Dominios que el siguiente pull pide completos.
 *
 * `productos` sólo viaja con el catálogo: pedirlo completo sin catálogo no
 * serviría para nada (el servidor no lo manda) y no se podría borrar lo que ya
 * no se lleva. Por eso sólo entra si este pull incluye el catálogo.
 */
export function planFullDomains(input: {
  config: LocalSyncConfig | null;
  applied: AppliedRevisions;
  includeCatalog: boolean;
}): SelectiveDomain[] {
  const domains: SelectiveDomain[] = [];
  if (domainOutOfDate('clientes', input.config, input.applied)) domains.push('clientes');
  if (input.includeCatalog && domainOutOfDate('productos', input.config, input.applied)) {
    domains.push('productos');
  }
  return domains;
}

/**
 * ¿Hay que traer el catálogo en este pull aunque nadie lo pidió? Sí cuando la
 * selección de productos cambió y el teléfono YA tiene catálogo: si no, los
 * productos desmarcados seguirían en el buscador sin señal hasta mañana.
 * Quien nunca bajó el catálogo no paga esos megas por esto.
 */
export function mustRefreshCatalogForSelection(input: {
  config: LocalSyncConfig | null;
  applied: AppliedRevisions;
  hasCatalog: boolean;
}): boolean {
  return input.hasCatalog && domainOutOfDate('productos', input.config, input.applied);
}

/** Dominios que llegaron completos en este paquete (sólo los conocidos). */
export function fullDomainsSent(payload: PullPayload): SelectiveDomain[] {
  const sent = Array.isArray(payload.full_domains_sent) ? payload.full_domains_sent : [];
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

/** ¿Se envía `p_options` en este pull? */
export function shouldSendSelectiveOptions(input: {
  supported: string | null;
  checkedAt: number | null;
  manual: boolean;
  now?: number;
}): boolean {
  if (input.supported !== 'false') return true;
  if (input.manual) return true;
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

// ---------------------------------------------------------------------------
// API para las pantallas (firmas del contrato)
// ---------------------------------------------------------------------------

/** Preferencias de la última descarga; `null` sin base local o si nunca llegaron. */
export async function getLocalSyncConfig(): Promise<LocalSyncConfig | null> {
  if (!isDatabaseOpen()) return null;
  return readSyncConfig(getDatabase());
}

/**
 * ¿El servidor sabe hacer descarga selectiva? Sólo es true cuando un pull con
 * `p_options` salió bien; mientras no se sepa, la pantalla oculta los ajustes.
 */
export async function isSelectiveSyncSupported(): Promise<boolean> {
  if (!isDatabaseOpen()) return false;
  return (await getMeta(getDatabase(), SELECTIVE_SUPPORTED_META_KEY)) === 'true';
}
