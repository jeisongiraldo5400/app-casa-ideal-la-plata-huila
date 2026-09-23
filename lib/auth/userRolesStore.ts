import { create } from 'zustand';
import { AppState, type NativeEventSubscription } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { logHandledError } from '@/lib/errorMessage';
import { getCachedRoles, setCachedRoles, type CachedRoles } from '@/lib/offline/security/secureKeys';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { supabase } from '@/lib/supabase';

/**
 * Punto de verdad único de los roles del usuario.
 *
 * Antes cada pantalla montaba `useUserRoles` por su cuenta y cada copia hacía
 * DOS viajes encadenados (`user_roles` y después `roles`). Aquí se resuelve con
 * UNA sola consulta (join anidado de PostgREST) y el resultado se comparte: da
 * igual cuántos consumidores haya, la carga se hace una vez.
 *
 * La caché de `secureKeys` ya no es sólo el plan B de «no hay red»: se pinta
 * primero y la red la corrige en segundo plano, así la app no espera para saber
 * quién es el usuario.
 */

export type UserRole = CachedRoles['roles'][number];

/** Lista vacía compartida: mantiene estable la identidad de `roles`. */
const EMPTY_ROLES: UserRole[] = [];

type RolesSource = 'none' | 'cache' | 'network';

interface UserRolesState {
  userId: string | null;
  roles: UserRole[];
  /** `true` mientras no se conozca ningún resultado, ni de caché ni de red. */
  loading: boolean;
  /** De dónde salieron los roles que hay pintados ahora mismo. */
  source: RolesSource;
  /** `setUser` ya corrió al menos una vez (distinto de «el usuario es null»). */
  initialized: boolean;
  /** Declara quién es el usuario actual y arranca la carga si cambió. */
  setUser: (userId: string | null) => void;
  /** Relee los roles de la red. Sin efecto si no hay usuario. */
  refresh: () => Promise<void>;
  /** Vuelve al estado inicial y suelta las suscripciones (pruebas y cierre de sesión). */
  reset: () => void;
}

// --- Estado de módulo: nada de esto debe vivir en el store reactivo ---------

/** Invalida respuestas viejas cuando cambia el usuario o llega otra carga. */
let loadGeneration = 0;
/** Carga en vuelo: una segunda llamada se cuelga de ella en vez de repetirla. */
let inFlight: Promise<void> | null = null;
/** Consumidores montados: las suscripciones existen sólo si hay alguno. */
let watchers = 0;
let appStateSubscription: NativeEventSubscription | null = null;
let rolesChannel: RealtimeChannel | null = null;
/** Usuario al que apuntan las suscripciones vivas. */
let watchedUserId: string | null = null;

// --- Lectura ---------------------------------------------------------------

type RawRole = { id: string; nombre: string; deleted_at?: string | null };

/**
 * PostgREST devuelve el recurso anidado como objeto o como lista según cómo
 * infiera la cardinalidad de la relación; se aceptan las dos formas.
 */
function normalizeRole(raw: unknown): UserRole['role'] {
  const role = (Array.isArray(raw) ? raw[0] : raw) as RawRole | null | undefined;
  if (!role || role.deleted_at) return null;
  return { id: role.id, nombre: role.nombre };
}

/**
 * UNA consulta: `user_roles` con el rol embebido. `deleted_at` se filtra en el
 * cliente para conservar la forma anterior (la fila sigue, con `role: null`).
 */
async function fetchRolesFromNetwork(userId: string): Promise<UserRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, role_id, role:roles(id, nombre, deleted_at)')
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    role_id: String(row.role_id),
    role: normalizeRole(row.role),
  }));
}

/** Evita cambiar la identidad de `roles` cuando el refresco trae lo mismo. */
function sameRoles(a: readonly UserRole[], b: readonly UserRole[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return (
      row.id === other.id &&
      row.role_id === other.role_id &&
      (row.role?.id ?? null) === (other.role?.id ?? null) &&
      (row.role?.nombre ?? null) === (other.role?.nombre ?? null)
    );
  });
}

function applyRoles(userId: string, roles: UserRole[], source: 'cache' | 'network') {
  const state = useUserRolesStore.getState();
  // El usuario cambió mientras la respuesta venía en camino.
  if (state.userId !== userId) return;
  // La red ya contestó: la caché no la pisa.
  if (source === 'cache' && state.source === 'network') return;
  const next = sameRoles(state.roles, roles) ? state.roles : roles;
  useUserRolesStore.setState({ roles: next, loading: false, source });
}

/** Deja de esperar sin cambiar lo que ya hubiera pintado. */
function stopWaiting(userId: string) {
  useUserRolesStore.setState((state) => (state.userId === userId ? { loading: false } : state));
}

function loadRoles(userId: string, options: { paintFromCache: boolean }): Promise<void> {
  const generation = ++loadGeneration;

  // La caché se lee una sola vez por carga, la pinte o sólo la use de respaldo.
  let cachePromise: Promise<CachedRoles | null> | null = null;
  const readCache = () => (cachePromise ??= getCachedRoles().catch(() => null));

  if (options.paintFromCache) {
    void readCache().then((cached) => {
      if (generation !== loadGeneration) return;
      if (cached?.userId === userId) applyRoles(userId, cached.roles, 'cache');
    });
  }

  const request = (async () => {
    try {
      const roles = await fetchRolesFromNetwork(userId);
      if (generation !== loadGeneration) return;
      applyRoles(userId, roles, 'network');
      await setCachedRoles({ userId, roles });
    } catch (error) {
      // Sin red se usan los roles cacheados: es el camino previsto y no un
      // fallo. Con `console.error`, LogBox pintaba la pantalla roja en
      // desarrollo y tapaba los avisos propios (el "Pago guardado sin
      // conexión", por ejemplo).
      logHandledError('No se pudieron leer los roles del usuario', error);
      if (generation !== loadGeneration) return;
      const cached = await readCache();
      if (generation !== loadGeneration) return;
      if (cached?.userId === userId) {
        applyRoles(userId, cached.roles, 'cache');
      } else if (!isNetworkError(error)) {
        // Error real del servidor y sin caché: sin roles, que es lo restrictivo.
        applyRoles(userId, EMPTY_ROLES, 'network');
      } else {
        stopWaiting(userId);
      }
    }
  })().finally(() => {
    if (inFlight === request) inFlight = null;
  });

  inFlight = request;
  return request;
}

// --- Suscripciones (AppState + realtime), una sola vez ---------------------

function syncWatchers() {
  const wanted = watchers > 0 ? useUserRolesStore.getState().userId : null;
  if (wanted === watchedUserId) return;

  appStateSubscription?.remove();
  appStateSubscription = null;
  if (rolesChannel) {
    void supabase.removeChannel(rolesChannel);
    rolesChannel = null;
  }

  watchedUserId = wanted;
  if (!wanted) return;

  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void useUserRolesStore.getState().refresh();
  });

  rolesChannel = supabase
    .channel(`user-roles-${wanted}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${wanted}` },
      () => void useUserRolesStore.getState().refresh()
    )
    .subscribe();
}

/**
 * Registra un consumidor montado. Devuelve la función para soltarlo: cuando no
 * queda ninguno se cierran el canal de realtime y el listener de AppState.
 */
export function retainUserRolesWatchers(): () => void {
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

// --- Store -----------------------------------------------------------------

export const useUserRolesStore = create<UserRolesState>((set, get) => ({
  userId: null,
  roles: EMPTY_ROLES,
  // Arranca en `true`: mientras no se sepa nada, «todavía no sé el rol».
  loading: true,
  source: 'none',
  initialized: false,

  setUser: (userId) => {
    const state = get();
    if (state.initialized && state.userId === userId) return;

    // Todo lo que viniera en camino pertenece al usuario anterior.
    loadGeneration += 1;
    inFlight = null;

    if (!userId) {
      set({ userId: null, roles: EMPTY_ROLES, loading: false, source: 'none', initialized: true });
      syncWatchers();
      return;
    }

    set({ userId, roles: EMPTY_ROLES, loading: true, source: 'none', initialized: true });
    syncWatchers();
    void loadRoles(userId, { paintFromCache: true });
  },

  refresh: async () => {
    const { userId } = get();
    if (!userId) return;
    // Dos disparos a la vez (AppState y realtime) comparten la misma consulta.
    if (inFlight) return inFlight;
    await loadRoles(userId, { paintFromCache: false });
  },

  reset: () => {
    loadGeneration += 1;
    inFlight = null;
    watchers = 0;
    set({ userId: null, roles: EMPTY_ROLES, loading: true, source: 'none', initialized: false });
    syncWatchers();
  },
}));
