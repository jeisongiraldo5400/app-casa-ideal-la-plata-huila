import { create } from 'zustand';
import { AppState, type NativeEventSubscription } from 'react-native';
import { logHandledError } from '@/lib/errorMessage';
import {
  getCachedSaleWarehouses,
  setCachedSaleWarehouses,
  type CachedSaleWarehouses,
} from '@/lib/offline/security/secureKeys';
import { supabase } from '@/lib/supabase';

/**
 * Bodegas de las que el usuario puede vender (`get_my_sale_warehouses`, 3.5.0).
 *
 * Mismo esquema que `userRolesStore`: la caché de SecureStore se pinta primero
 * y la red la corrige; sin señal se usa la caché. Si no hay ni caché ni
 * respuesta, `source` queda en `none` y la pantalla NO muestra bodegas (se
 * falla cerrado) hasta que se pueda consultar.
 */

type SaleWarehousesSource = 'none' | 'cache' | 'network';

interface SaleWarehousesState {
  userId: string | null;
  /** Lo que dice el servidor (o la caché) sobre si es admin. */
  isAdmin: boolean;
  warehouseIds: string[];
  source: SaleWarehousesSource;
  loading: boolean;
  /** Último fallo sin caché que lo respalde; null si hay datos o no falló. */
  error: string | null;
  initialized: boolean;
  setUser: (userId: string | null) => void;
  refresh: () => Promise<void>;
  reset: () => void;
}

const EMPTY_IDS: string[] = [];

let loadGeneration = 0;
let inFlight: Promise<void> | null = null;
let watchers = 0;
let appStateSubscription: NativeEventSubscription | null = null;

/** Valida la forma `{ is_admin, warehouse_ids }`; lo demás se descarta. */
export function parseSaleWarehousesResponse(
  data: unknown
): { isAdmin: boolean; warehouseIds: string[] } {
  const raw = (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Respuesta inválida de get_my_sale_warehouses');
  }
  const ids = Array.isArray(raw.warehouse_ids) ? raw.warehouse_ids : [];
  return {
    isAdmin: raw.is_admin === true,
    warehouseIds: [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))],
  };
}

async function fetchFromNetwork(): Promise<{ isAdmin: boolean; warehouseIds: string[] }> {
  const { data, error } = await supabase.rpc('get_my_sale_warehouses');
  if (error) throw error;
  return parseSaleWarehousesResponse(data);
}

function sameIds(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function apply(
  userId: string,
  value: { isAdmin: boolean; warehouseIds: string[] },
  source: 'cache' | 'network'
) {
  const state = useSaleWarehousesStore.getState();
  if (state.userId !== userId) return;
  if (source === 'cache' && state.source === 'network') return;
  useSaleWarehousesStore.setState({
    isAdmin: value.isAdmin,
    warehouseIds: sameIds(state.warehouseIds, value.warehouseIds) ? state.warehouseIds : value.warehouseIds,
    source,
    loading: false,
    error: null,
  });
}

function load(userId: string, options: { paintFromCache: boolean }): Promise<void> {
  const generation = ++loadGeneration;
  let cachePromise: Promise<CachedSaleWarehouses | null> | null = null;
  const readCache = () => (cachePromise ??= getCachedSaleWarehouses().catch(() => null));

  if (options.paintFromCache) {
    void readCache().then((cached) => {
      if (generation !== loadGeneration) return;
      if (cached?.userId === userId) apply(userId, cached, 'cache');
    });
  }

  useSaleWarehousesStore.setState((state) =>
    state.userId === userId ? { loading: true } : state
  );

  const request = (async () => {
    try {
      const value = await fetchFromNetwork();
      if (generation !== loadGeneration) return;
      apply(userId, value, 'network');
      await setCachedSaleWarehouses({ userId, ...value }).catch(() => undefined);
    } catch (error) {
      logHandledError('No se pudieron leer las bodegas de venta', error);
      if (generation !== loadGeneration) return;
      const cached = await readCache();
      if (generation !== loadGeneration) return;
      if (cached?.userId === userId) {
        apply(userId, cached, 'cache');
        return;
      }
      // Ni red ni caché: se queda sin bodegas (cerrado) y se avisa.
      useSaleWarehousesStore.setState((state) =>
        state.userId === userId
          ? {
              loading: false,
              error:
                state.source === 'none'
                  ? 'No se pudieron cargar tus bodegas de venta.'
                  : state.error,
            }
          : state
      );
    }
  })().finally(() => {
    if (inFlight === request) inFlight = null;
  });

  inFlight = request;
  return request;
}

function syncWatchers() {
  const wanted = watchers > 0 && Boolean(useSaleWarehousesStore.getState().userId);
  if (wanted && !appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useSaleWarehousesStore.getState().refresh();
    });
  } else if (!wanted && appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

/** Registra un consumidor: mientras haya alguno, se refresca al volver al frente. */
export function retainSaleWarehousesWatchers(): () => void {
  watchers += 1;
  syncWatchers();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    watchers = Math.max(0, watchers - 1);
    syncWatchers();
  };
}

export const useSaleWarehousesStore = create<SaleWarehousesState>((set, get) => ({
  userId: null,
  isAdmin: false,
  warehouseIds: EMPTY_IDS,
  source: 'none',
  loading: true,
  error: null,
  initialized: false,

  setUser: (userId) => {
    const state = get();
    if (state.initialized && state.userId === userId) return;

    loadGeneration += 1;
    inFlight = null;

    if (!userId) {
      set({
        userId: null,
        isAdmin: false,
        warehouseIds: EMPTY_IDS,
        source: 'none',
        loading: false,
        error: null,
        initialized: true,
      });
      syncWatchers();
      return;
    }

    set({
      userId,
      isAdmin: false,
      warehouseIds: EMPTY_IDS,
      source: 'none',
      loading: true,
      error: null,
      initialized: true,
    });
    syncWatchers();
    void load(userId, { paintFromCache: true });
  },

  refresh: async () => {
    const { userId } = get();
    if (!userId) return;
    if (inFlight) return inFlight;
    await load(userId, { paintFromCache: false });
  },

  reset: () => {
    loadGeneration += 1;
    inFlight = null;
    watchers = 0;
    set({
      userId: null,
      isAdmin: false,
      warehouseIds: EMPTY_IDS,
      source: 'none',
      loading: true,
      error: null,
      initialized: false,
    });
    syncWatchers();
  },
}));
