/**
 * Preferencias de la descarga selectiva («Preparar el teléfono»).
 *
 * Única puerta de la app a los RPC de preferencias (migración
 * 20261130120000): `get_mobile_sync_config`, `set_mobile_sync_mode`,
 * `set_mobile_sync_selection` y `list_mobile_sync_selection`. Tras cada cambio
 * NO se descarga nada (contrato v2): la elección queda «Pendiente de descargar»
 * hasta que la persona pulse «Descargar» en «Preparar el teléfono».
 *
 * v3 (20261205120000): los clientes van SIEMPRE todos (ya no hay «Elegir»,
 * municipios ni «Mis clientes»). Quedan dos preferencias: productos
 * (todo | ninguno) y las órdenes marcadas una a una.
 *
 * El estado vive en un store de zustand compartido: la lista de órdenes, su
 * detalle y la pantalla de ajustes ven la misma marca sin volver a preguntar
 * al servidor. `useOfflineSelection('ordenes')` es el hook que usan las
 * pantallas de órdenes; `useOfflineSelection('productos').mode` dice si el
 * catálogo va en el teléfono.
 *
 * Si el servidor no tiene los RPC (PGRST202), `supported` queda en `false` y la
 * UI se oculta sin romper nada. No se exige `isSelectiveSyncSupported()`: con
 * la descarga solo manual, antes del primer «Descargar» aún no se sabe, y la
 * pantalla es justo donde se prepara esa primera descarga.
 */
import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errorMessage';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { isDatabaseOpen } from '@/lib/offline/database';
import {
  getLocalSyncConfig,
  hasPendingChoicesToDownload,
  lastManualDownloadAt,
  markChoicesChangedLocally,
} from '@/lib/offline/sync/syncPrefs';

/** Dominios de preferencia: productos (modo) y órdenes (selección). */
export type SyncPrefDomain = 'productos' | 'ordenes';
/** Lo único que se elige una a una. */
export type SelectionDomain = 'ordenes';
/** productos: todo | ninguno · ordenes: seleccion. */
export type SyncMode = 'todo' | 'seleccion' | 'ninguno';

export type DomainSyncConfig = {
  mode: SyncMode;
  revision: number;
  count: number;
  /** Ids marcados; `null` si el servidor solo mandó el conteo y aún no se pidieron. */
  ids: string[] | null;
};

export type SyncConfig = Record<SyncPrefDomain, DomainSyncConfig>;

/** Lo que `get_mobile_sync_config` manda además de los dominios. */
export type SyncConfigMeta = {
  /** Total exacto que bajaría la próxima descarga. */
  estimated: { clientes: number; negocios: number } | null;
  ordersAllowed: boolean;
  catalogAllowed: boolean;
};

export const DEFAULT_CONFIG_META: SyncConfigMeta = {
  estimated: null,
  ordersAllowed: true,
  catalogAllowed: true,
};

export type SelectionItem = {
  id: string;
  label: string;
  detail: string | null;
  selectedAt: string | null;
};

/** Tope del RPC por llamada; los lotes más grandes se parten. */
export const SELECTION_CHUNK_SIZE = 200;
/** Topes totales del servidor (el RPC los hace cumplir; aquí solo se avisan). */
export const SELECTION_LIMITS: Record<SelectionDomain, number> = {
  ordenes: 100,
};

const FUNCTION_NOT_FOUND = 'PGRST202';

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

function rpc(fn: string, args?: Record<string, unknown>) {
  return (supabase.rpc as unknown as UntypedRpc)(fn, args);
}

export class SyncPrefsUnsupportedError extends Error {
  constructor() {
    super('Este servidor aún no permite elegir qué llevar en el teléfono.');
    this.name = 'SyncPrefsUnsupportedError';
  }
}

function isFunctionMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === FUNCTION_NOT_FOUND ||
    error.code === '42883' ||
    /could not find the function/i.test(error.message ?? '')
  );
}

async function call(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await rpc(fn, args);
  if (isFunctionMissing(error)) throw new SyncPrefsUnsupportedError();
  if (error) {
    // Los RPC de preferencias ya responden en español («Puedes llevar hasta N
    // …», «Sin permiso …»): se muestran tal cual.
    const wrapped = new Error(error.message?.trim() || errorMessage(error, 'No se pudo guardar la preferencia'));
    (wrapped as Error & { code?: string }).code = error.code;
    throw wrapped;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Lectura tolerante de las respuestas (el contrato deja abierto si los ids
// vienen dentro de cada dominio o aparte).

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => (typeof item === 'string' ? item : String(asRecord(item).entity_id ?? asRecord(item).id ?? '')))
    .filter(Boolean);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DOMAINS: SyncPrefDomain[] = ['productos', 'ordenes'];

function isSelectionDomain(domain: SyncPrefDomain): domain is SelectionDomain {
  return domain === 'ordenes';
}

export function defaultDomainConfig(domain: SyncPrefDomain): DomainSyncConfig {
  // Productos no tiene ids (todo | ninguno): `ids` en [] para no pedirlos.
  return { mode: isSelectionDomain(domain) ? 'seleccion' : 'todo', revision: 0, count: 0, ids: [] };
}

function parseMode(domain: SyncPrefDomain, raw: unknown): SyncMode {
  if (isSelectionDomain(domain)) return 'seleccion';
  return raw === 'ninguno' ? 'ninguno' : 'todo';
}

export function parseSyncConfig(data: unknown): SyncConfig {
  const root = asRecord(data);
  const selected = asRecord(root.selected ?? root.ids ?? root.selections);
  const config = {} as SyncConfig;
  for (const domain of DOMAINS) {
    const raw = asRecord(root[domain]);
    const mode = parseMode(domain, raw.mode);
    if (!isSelectionDomain(domain)) {
      config[domain] = { mode, revision: toNumber(raw.revision), count: 0, ids: [] };
      continue;
    }
    const ids = asIds(raw.ids) ?? asIds(selected[domain]);
    config[domain] = {
      mode,
      revision: toNumber(raw.revision),
      count: toNumber(raw.count, ids?.length ?? 0),
      ids: ids ?? (toNumber(raw.count) === 0 ? [] : null),
    };
  }
  return config;
}

export function parseConfigMeta(data: unknown): SyncConfigMeta {
  const root = asRecord(data);
  const estimated = asRecord(root.estimated);
  const hasEstimate = estimated.clientes != null;
  return {
    estimated: hasEstimate
      ? { clientes: toNumber(estimated.clientes), negocios: toNumber(estimated.negocios) }
      : null,
    ordersAllowed: root.orders_allowed !== false,
    catalogAllowed: root.catalog_allowed !== false,
  };
}

function parseSelectionItems(data: unknown): SelectionItem[] {
  const root = asRecord(data);
  const rows = Array.isArray(data) ? data : Array.isArray(root.items) ? root.items : [];
  return rows
    .map((row) => {
      const record = asRecord(row);
      const id = String(record.entity_id ?? record.id ?? '');
      const label =
        record.label ?? record.name ?? record.display_name ?? record.order_number ?? record.full_name;
      const detail = record.detail ?? record.id_number ?? record.sku ?? record.customer_name ?? null;
      const baseDetail = detail != null && String(detail).trim() ? String(detail) : null;
      // `exists = false`: se eliminó en el servidor; se lista para poder quitarlo.
      const gone = record.exists === false;
      return {
        id,
        label: label != null && String(label).trim() ? String(label) : 'Sin nombre',
        detail: gone ? [baseDetail, 'ya no existe'].filter(Boolean).join(' · ') : baseDetail,
        selectedAt: record.selected_at ? String(record.selected_at) : null,
      };
    })
    .filter((item) => item.id);
}

// ---------------------------------------------------------------------------
// Store compartido

export type SyncPrefsStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'unsupported' | 'error';

type SyncPrefsState = {
  status: SyncPrefsStatus;
  config: SyncConfig;
  meta: SyncConfigMeta;
  error: string | null;
  /** Ids con un cambio en curso (para desactivar el botón mientras tanto). */
  busyIds: Record<string, true>;
  /** Hay elecciones hechas que aún no se descargan (motor: `hasPendingChoicesToDownload`). */
  pendingDownload: boolean;
  /** Última descarga manual (ms), según el motor. */
  lastManualAt: number | null;
};

function initialState(): SyncPrefsState {
  return {
    status: 'idle',
    config: {
      productos: defaultDomainConfig('productos'),
      ordenes: defaultDomainConfig('ordenes'),
    },
    meta: DEFAULT_CONFIG_META,
    error: null,
    busyIds: {},
    pendingDownload: false,
    lastManualAt: null,
  };
}

export const useSyncPrefsStore = create<SyncPrefsState>(() => initialState());

/** Para pruebas y al cerrar sesión. */
export function resetSyncPrefs() {
  inFlightLoad = null;
  lastServerConfig = undefined;
  useSyncPrefsStore.setState(initialState(), true);
}

function patchDomain(domain: SyncPrefDomain, patch: Partial<DomainSyncConfig>) {
  useSyncPrefsStore.setState((state) => ({
    config: { ...state.config, [domain]: { ...state.config[domain], ...patch } },
  }));
}

// ---------------------------------------------------------------------------
// «Pendiente de descargar»: lo decide el motor (BC) con
// `hasPendingChoicesToDownload`, que compara la hora del último cambio hecho en
// este teléfono (`markChoicesChangedLocally`) con la última descarga manual y,
// si se le pasa, la configuración recién leída del servidor con la descargada.

/** Última respuesta cruda de `get_mobile_sync_config` (para comparar con lo descargado). */
let lastServerConfig: unknown;

type PendingArg = Parameters<typeof hasPendingChoicesToDownload>[0];

export function isDownloadPending(state: Pick<SyncPrefsState, 'pendingDownload'>) {
  return state.pendingDownload;
}

function markChanged() {
  // Se ve al instante; la marca persistente la guarda el motor.
  useSyncPrefsStore.setState({ pendingDownload: true });
  void (async () => markChoicesChangedLocally())().catch(() => undefined);
  void refreshEstimate();
}

/** Relee si hay elecciones pendientes y la hora de la última descarga manual. */
export async function refreshDownloadState() {
  const [pending, manualAt] = await Promise.all([
    (async () => hasPendingChoicesToDownload(lastServerConfig as PendingArg))().catch(() => null),
    (async () => lastManualDownloadAt())().catch(() => null),
  ]);
  useSyncPrefsStore.setState((state) => ({
    pendingDownload: pending ?? state.pendingDownload,
    lastManualAt: manualAt ?? null,
  }));
}

/** Pagina `list_mobile_sync_selection` con nombre para la pantalla de ajustes. */
export async function listSyncSelection(
  domain: SelectionDomain,
  limit = 20,
  offset = 0
): Promise<SelectionItem[]> {
  const data = await call('list_mobile_sync_selection', {
    p_domain: domain,
    p_limit: limit,
    p_offset: offset,
  });
  return parseSelectionItems(data);
}

async function fillMissingIds(config: SyncConfig) {
  for (const domain of DOMAINS) {
    const current = config[domain];
    if (current.ids !== null || !isSelectionDomain(domain)) continue;
    const ids: string[] = [];
    for (let offset = 0; offset < SELECTION_LIMITS[domain]; offset += SELECTION_CHUNK_SIZE) {
      const page = await listSyncSelection(domain, SELECTION_CHUNK_SIZE, offset);
      ids.push(...page.map((item) => item.id));
      if (page.length < SELECTION_CHUNK_SIZE) break;
    }
    config[domain] = { ...current, ids, count: Math.max(current.count, ids.length) };
  }
}

/** Configuración del usuario desde el servidor; actualiza el store. */
export async function getSyncConfig(): Promise<SyncConfig> {
  const data = await call('get_mobile_sync_config');
  lastServerConfig = data;
  const config = parseSyncConfig(data);
  await fillMissingIds(config);
  useSyncPrefsStore.setState({ config, meta: parseConfigMeta(data), status: 'ready', error: null });
  return config;
}

/**
 * Tras un cambio, solo se relee el total estimado (y los flags): los ids ya
 * quedaron en el store y releerlos todos sería una consulta por marca.
 */
async function refreshEstimate() {
  try {
    const data = await call('get_mobile_sync_config');
    lastServerConfig = data;
    useSyncPrefsStore.setState({ meta: parseConfigMeta(data) });
  } catch {
    // El estimado se queda como estaba; no es motivo para avisar.
  }
}

let inFlightLoad: Promise<void> | null = null;

async function applyLocalFallback() {
  const local = await Promise.resolve(getLocalSyncConfig()).catch(() => null);
  if (!local) {
    useSyncPrefsStore.setState({ status: 'offline' });
    return;
  }
  const localRecord = asRecord(local);
  useSyncPrefsStore.setState((state) => {
    const config = { ...state.config };
    const raw = asRecord(localRecord.productos);
    if (raw.mode === 'todo' || raw.mode === 'ninguno') {
      config.productos = { ...config.productos, mode: parseMode('productos', raw.mode) };
    }
    return { config, status: 'offline' };
  });
}

/**
 * Carga la configuración una vez por sesión (o de nuevo con `force`). Sin
 * señal se queda con el modo que guardó el último pull en el teléfono.
 */
export function loadSyncPrefs(options: { force?: boolean } = {}): Promise<void> {
  const { status } = useSyncPrefsStore.getState();
  // Una sola carga compartida: las tarjetas de una lista larga montan el hook
  // cada una, y solo la primera (estado `idle`) llega al servidor. Los
  // reintentos tras `offline`/`error` los pide la franja de sincronización
  // al volver la señal (o la pantalla de ajustes con «Reintentar»).
  if (!options.force && status !== 'idle') return Promise.resolve();
  // Sin base local (antes de iniciar sesión, o en pruebas) no hay descarga que
  // ajustar: se espera a la próxima vez sin fijar ningún estado.
  if (!isDatabaseOpen()) return Promise.resolve();
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = (async () => {
    if (useSyncPrefsStore.getState().status === 'idle') {
      useSyncPrefsStore.setState({ status: 'loading' });
    }
    try {
      await getSyncConfig();
      void refreshDownloadState();
    } catch (error) {
      void refreshDownloadState();
      if (error instanceof SyncPrefsUnsupportedError) {
        useSyncPrefsStore.setState({ status: 'unsupported' });
      } else if (isNetworkError(error) || !useSyncStore.getState().online) {
        await applyLocalFallback();
      } else {
        useSyncPrefsStore.setState({ status: 'error', error: errorMessage(error, 'No se pudo leer la preferencia') });
      }
    }
  })().finally(() => {
    inFlightLoad = null;
  });
  return inFlightLoad;
}

export async function setSyncMode(domain: SyncPrefDomain, mode: SyncMode) {
  if (isSelectionDomain(domain)) throw new Error('Este dominio siempre se elige uno a uno.');
  const data = asRecord(await call('set_mobile_sync_mode', { p_domain: domain, p_mode: mode }));
  patchDomain(domain, {
    mode,
    revision: toNumber(data.revision, useSyncPrefsStore.getState().config[domain].revision + 1),
  });
  markChanged();
}

/**
 * Marca o desmarca ids (en lotes de 200); queda pendiente de descargar. Devuelve
 * el conteo y la revisión que respondió el servidor en el último lote.
 */
export async function setSyncSelection(
  domain: SelectionDomain,
  ids: string[],
  selected: boolean
): Promise<{ count: number; revision: number }> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const before = useSyncPrefsStore.getState().config[domain];
  let count = before.count;
  let revision = before.revision;
  const applied = new Set(before.ids ?? []);
  let anyApplied = false;
  try {
    for (let start = 0; start < unique.length; start += SELECTION_CHUNK_SIZE) {
      const chunk = unique.slice(start, start + SELECTION_CHUNK_SIZE);
      const data = asRecord(
        await call('set_mobile_sync_selection', { p_domain: domain, p_ids: chunk, p_selected: selected })
      );
      for (const id of chunk) {
        if (selected) applied.add(id);
        else applied.delete(id);
      }
      count = toNumber(data.count, applied.size);
      revision = toNumber(data.revision, revision);
      anyApplied = true;
    }
  } finally {
    // Aunque un lote falle (tope alcanzado), los anteriores ya quedaron.
    if (anyApplied) {
      patchDomain(domain, { ids: before.ids === null ? null : Array.from(applied), count, revision });
      markChanged();
    }
  }
  return { count, revision };
}

// ---------------------------------------------------------------------------
// Hooks

/** Estado completo de las preferencias (pantalla de ajustes, perfil, banner). */
export function useSyncPrefs() {
  const status = useSyncPrefsStore((state) => state.status);
  const config = useSyncPrefsStore((state) => state.config);
  const error = useSyncPrefsStore((state) => state.error);
  const meta = useSyncPrefsStore((state) => state.meta);
  const pendingDownload = useSyncPrefsStore(isDownloadPending);
  const lastManualAt = useSyncPrefsStore((state) => state.lastManualAt);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  useEffect(() => {
    void loadSyncPrefs();
  }, []);
  // Tras una descarga se relee su hora: el «Pendiente de descargar» se apaga solo.
  useEffect(() => {
    void refreshDownloadState();
  }, [lastSyncedAt]);
  return {
    status,
    config,
    meta,
    error,
    pendingDownload,
    lastManualAt,
    supported: status === 'ready' || status === 'offline',
    reload: () => loadSyncPrefs({ force: true }),
  };
}

export type OfflineSelection = {
  isSelected: (id: string | null | undefined) => boolean;
  /** Marca o desmarca; avisa por `Alert` si no hay señal o el servidor lo rechaza. Devuelve si se aplicó. */
  toggle: (id: string) => Promise<boolean>;
  count: number;
  mode: SyncMode;
  supported: boolean;
  /** true mientras ese id se está guardando. */
  isBusy: (id: string | null | undefined) => boolean;
  /** Hay elecciones hechas que aún no se descargan. */
  pendingDownload: boolean;
  /** Ids elegidos conocidos (vacío si solo se sabe el conteo). */
  selectedIds: string[];
};

const EMPTY_IDS: string[] = [];

const DOMAIN_NOUN: Record<SyncPrefDomain, string> = {
  productos: 'el producto',
  ordenes: 'la orden',
};

/**
 * Marca por entidad para las pantallas: `isSelected(id)`, `toggle(id)`,
 * `count`, `mode` y `supported`. Firma fijada por el contrato; el paquete E la
 * usa para órdenes (`useOfflineSelection('ordenes')`).
 */
export function useOfflineSelection(domain: SyncPrefDomain): OfflineSelection {
  const status = useSyncPrefsStore((state) => state.status);
  const domainConfig = useSyncPrefsStore((state) => state.config[domain]);
  const busyIds = useSyncPrefsStore((state) => state.busyIds);
  const pendingDownload = useSyncPrefsStore(isDownloadPending);

  useEffect(() => {
    void loadSyncPrefs();
  }, []);

  const isSelected = useCallback(
    (id: string | null | undefined) => Boolean(id && domainConfig.ids?.includes(id)),
    [domainConfig.ids]
  );

  const isBusy = useCallback((id: string | null | undefined) => Boolean(id && busyIds[id]), [busyIds]);

  const toggle = useCallback(
    async (id: string) => {
      // Productos no se marca uno a uno (todo | ninguno).
      if (!isSelectionDomain(domain)) return false;
      if (!useSyncStore.getState().online) {
        Alert.alert('Sin conexión', 'Necesitas señal para llevar o quitar del teléfono.');
        return false;
      }
      const selected = Boolean(useSyncPrefsStore.getState().config[domain].ids?.includes(id));
      useSyncPrefsStore.setState((state) => ({ busyIds: { ...state.busyIds, [id]: true } }));
      try {
        await setSyncSelection(domain, [id], !selected);
        return true;
      } catch (error) {
        Alert.alert(
          selected ? 'No se pudo quitar del teléfono' : 'No se pudo llevar al teléfono',
          error instanceof SyncPrefsUnsupportedError
            ? error.message
            : errorMessage(error, `Inténtalo de nuevo con ${DOMAIN_NOUN[domain]} más tarde.`)
        );
        return false;
      } finally {
        useSyncPrefsStore.setState((state) => {
          const next = { ...state.busyIds };
          delete next[id];
          return { busyIds: next };
        });
      }
    },
    [domain]
  );

  return {
    isSelected,
    toggle,
    count: domainConfig.count,
    mode: domainConfig.mode,
    supported: status === 'ready' || status === 'offline',
    isBusy,
    pendingDownload,
    selectedIds: domainConfig.ids ?? EMPTY_IDS,
  };
}
