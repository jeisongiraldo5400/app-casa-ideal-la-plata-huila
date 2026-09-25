/**
 * Preferencias de la descarga selectiva («Preparar el teléfono»).
 *
 * Única puerta de la app a los RPC de preferencias (migración
 * 20261130120000): `get_mobile_sync_config`, `set_mobile_sync_mode`,
 * `set_mobile_sync_selection` y `list_mobile_sync_selection`. Tras cada cambio
 * NO se descarga nada (contrato v2): la elección queda «Pendiente de descargar»
 * hasta que la persona pulse «Descargar» en «Preparar el teléfono».
 *
 * El estado vive en un store de zustand compartido: la ficha de un cliente, su
 * fila en la lista y la pantalla de ajustes ven la misma marca sin volver a
 * preguntar al servidor. `useOfflineSelection(domain)` es el hook que usan las
 * pantallas (clientes, productos y, en el paquete E, órdenes).
 *
 * Si el servidor no tiene los RPC (PGRST202), `supported` queda en `false` y la
 * UI se oculta sin romper nada. No se exige `isSelectiveSyncSupported()`: con
 * la descarga solo manual, antes del primer «Descargar» aún no se sabe, y la
 * pantalla es justo donde se prepara esa primera descarga.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errorMessage';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { isDatabaseOpen } from '@/lib/offline/database';
import { getLocalSyncConfig, lastManualDownloadAt } from '@/lib/offline/sync/syncPrefs';

/**
 * Dominios de preferencia. `municipios` es un dominio de selección (v2): los
 * clientes cuyo municipio está elegido bajan sin marcarlos uno a uno.
 */
export type SyncPrefDomain = 'clientes' | 'productos' | 'ordenes' | 'municipios';
/** clientes: todo | seleccion · productos: todo | ninguno · ordenes/municipios: seleccion. */
export type SyncMode = 'todo' | 'seleccion' | 'ninguno';

export type DomainSyncConfig = {
  mode: SyncMode;
  revision: number;
  count: number;
  /** Ids marcados; `null` si el servidor solo mandó el conteo y aún no se pidieron. */
  ids: string[] | null;
};

export type SyncConfig = Record<SyncPrefDomain, DomainSyncConfig>;

export type SelectionItem = {
  id: string;
  label: string;
  detail: string | null;
  selectedAt: string | null;
};

/** Tope del RPC por llamada; los lotes más grandes se parten. */
export const SELECTION_CHUNK_SIZE = 200;
/** Topes totales del servidor (el RPC los hace cumplir; aquí solo se avisan). */
export const SELECTION_LIMITS: Record<SyncPrefDomain, number> = {
  clientes: 1000,
  productos: 1000,
  ordenes: 100,
  municipios: 1200,
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
    // Se conserva el mensaje del RAISE («Puedes llevar hasta N …»): ya viene en español.
    const wrapped = new Error(errorMessage(error, 'No se pudo guardar la preferencia'));
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

const DOMAINS: SyncPrefDomain[] = ['clientes', 'productos', 'ordenes', 'municipios'];
const SELECTION_ONLY: SyncPrefDomain[] = ['ordenes', 'municipios'];

export function defaultDomainConfig(domain: SyncPrefDomain): DomainSyncConfig {
  const selectionOnly = SELECTION_ONLY.includes(domain);
  return { mode: selectionOnly ? 'seleccion' : 'todo', revision: 0, count: 0, ids: selectionOnly ? [] : null };
}

function parseMode(domain: SyncPrefDomain, raw: unknown): SyncMode {
  if (SELECTION_ONLY.includes(domain)) return 'seleccion';
  if (domain === 'productos') return raw === 'ninguno' ? 'ninguno' : 'todo';
  return raw === 'seleccion' ? 'seleccion' : 'todo';
}

export function parseSyncConfig(data: unknown): SyncConfig {
  const root = asRecord(data);
  const selected = asRecord(root.selected ?? root.ids ?? root.selections);
  const config = {} as SyncConfig;
  for (const domain of DOMAINS) {
    const raw = asRecord(root[domain]);
    const ids = asIds(raw.ids) ?? asIds(selected[domain]);
    const mode = parseMode(domain, raw.mode);
    config[domain] = {
      mode,
      revision: toNumber(raw.revision),
      count: toNumber(raw.count, ids?.length ?? 0),
      ids: ids ?? (toNumber(raw.count) === 0 ? [] : null),
    };
  }
  return config;
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
      return {
        id,
        label: label != null && String(label).trim() ? String(label) : 'Sin nombre',
        detail: detail != null && String(detail).trim() ? String(detail) : null,
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
  error: string | null;
  /** Ids con un cambio en curso (para desactivar el botón mientras tanto). */
  busyIds: Record<string, true>;
  /** Cuándo se cambió por última vez la elección (ms). */
  changedAt: number | null;
  /** Última descarga manual (ms), según el motor. */
  lastManualAt: number | null;
};

function initialState(): SyncPrefsState {
  return {
    status: 'idle',
    config: {
      clientes: defaultDomainConfig('clientes'),
      productos: defaultDomainConfig('productos'),
      ordenes: defaultDomainConfig('ordenes'),
      municipios: defaultDomainConfig('municipios'),
    },
    error: null,
    busyIds: {},
    changedAt: null,
    lastManualAt: null,
  };
}

export const useSyncPrefsStore = create<SyncPrefsState>(() => initialState());

/** Para pruebas y al cerrar sesión. */
export function resetSyncPrefs() {
  inFlightLoad = null;
  useSyncPrefsStore.setState(initialState(), true);
}

function patchDomain(domain: SyncPrefDomain, patch: Partial<DomainSyncConfig>) {
  useSyncPrefsStore.setState((state) => ({
    config: { ...state.config, [domain]: { ...state.config[domain], ...patch } },
  }));
}

// ---------------------------------------------------------------------------
// «Pendiente de descargar»: la elección cambió después de la última descarga
// manual. La hora del cambio se guarda por usuario en AsyncStorage para que el
// aviso sobreviva a un reinicio de la app.

const CHANGED_AT_KEY = 'casa_ideal.sync_prefs.changed_at';

function changedAtKey() {
  return `${CHANGED_AT_KEY}:${useSyncStore.getState().userId ?? 'anon'}`;
}

/** true si hay elecciones hechas después de la última descarga manual. */
export function isDownloadPending(state: Pick<SyncPrefsState, 'changedAt' | 'lastManualAt'>) {
  if (!state.changedAt) return false;
  return !state.lastManualAt || state.changedAt > state.lastManualAt;
}

function markChanged() {
  const now = Date.now();
  useSyncPrefsStore.setState({ changedAt: now });
  void AsyncStorage.setItem(changedAtKey(), String(now)).catch(() => undefined);
}

/** Relee la hora del último cambio y de la última descarga manual. */
export async function refreshDownloadState() {
  const [storedChanged, manualAt] = await Promise.all([
    AsyncStorage.getItem(changedAtKey()).catch(() => null),
    (async () => lastManualDownloadAt())().catch(() => null),
  ]);
  const parsed = storedChanged ? Number(storedChanged) : NaN;
  useSyncPrefsStore.setState((state) => ({
    changedAt: Number.isFinite(parsed) ? Math.max(parsed, state.changedAt ?? 0) : state.changedAt,
    lastManualAt: manualAt ?? null,
  }));
}

/** Pagina `list_mobile_sync_selection` con nombre para la pantalla de ajustes. */
export async function listSyncSelection(
  domain: SyncPrefDomain,
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
    if (current.ids !== null) continue;
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
  const config = parseSyncConfig(data);
  await fillMissingIds(config);
  useSyncPrefsStore.setState({ config, status: 'ready', error: null });
  return config;
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
    for (const domain of ['clientes', 'productos'] as const) {
      const raw = asRecord(localRecord[domain]);
      if (raw.mode === 'todo' || raw.mode === 'seleccion' || raw.mode === 'ninguno') {
        config[domain] = { ...config[domain], mode: parseMode(domain, raw.mode) };
      }
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
    void refreshDownloadState();
    if (useSyncPrefsStore.getState().status === 'idle') {
      useSyncPrefsStore.setState({ status: 'loading' });
    }
    try {
      await getSyncConfig();
    } catch (error) {
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
  if (SELECTION_ONLY.includes(domain)) throw new Error('Este dominio siempre se elige uno a uno.');
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
  domain: SyncPrefDomain,
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
  clientes: 'el cliente',
  productos: 'el producto',
  ordenes: 'la orden',
  municipios: 'el municipio',
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
