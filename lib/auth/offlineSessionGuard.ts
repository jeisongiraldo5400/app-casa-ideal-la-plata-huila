import type { Session } from '@supabase/supabase-js';

/**
 * Sesión vencida y sin señal: que la app caiga ya a lo guardado.
 *
 * El token de acceso dura 1 h. Vencido, CADA consulta a Supabase pasa antes por
 * `auth.getSession()`, que intenta refrescarlo con reintentos crecientes
 * (200 ms, 400 ms… hasta casi 30 s, `AUTO_REFRESH_TICK_DURATION_MS` de
 * auth-js). Sin señal eso son ~25 s de espera por consulta antes de que falle y
 * la pantalla lea lo del teléfono: el vendedor veía «cargando» y luego nada, y
 * cada pantalla volvía a esperar. Lo mismo con señal débil, peor aún, porque
 * cada intento espera el corte de 10 s.
 *
 * Esta guarda envuelve `getSession` del cliente (supabase-js la llama para
 * cada consulta, `SupabaseClient._getAccessToken`):
 * - sin señal y con la sesión vencida, devuelve la sesión guardada sin
 *   refrescar: la consulta sale enseguida, falla por red y se usa lo local;
 * - con señal, si el refresco tarda más de `waitMs`, la consulta sigue con la
 *   sesión guardada mientras el refresco termina por su cuenta (el siguiente
 *   `getSession` ya trae el token nuevo).
 * Con la sesión vigente no cambia nada. Nunca borra ni inventa sesiones.
 */

/** Igual que auth-js: se refresca cuando faltan menos de 90 s para vencer. */
export const SESSION_EXPIRY_MARGIN_MS = 90_000;

/** Lo que espera una consulta al refresco antes de seguir con la sesión guardada. */
export const AUTH_REFRESH_WAIT_MS = 8_000;

export function sessionNeedsRefresh(session: Pick<Session, 'expires_at'>, now = Date.now()): boolean {
  if (!session.expires_at) return true;
  return session.expires_at * 1000 - now < SESSION_EXPIRY_MARGIN_MS;
}

type GetSessionResult = { data: { session: Session | null }; error: unknown };

type AuthLike = { getSession: () => Promise<GetSessionResult> };

export type OfflineSessionGuardDeps = {
  /** NetInfo dice que hay red (mismo criterio que la sincronización). */
  isOnline: () => boolean;
  /** Sesión guardada tal cual, sin refrescar. */
  readStoredSession: () => Promise<Session | null>;
  waitMs?: number;
  now?: () => number;
};

export function installOfflineSessionGuard(auth: AuthLike, deps: OfflineSessionGuardDeps): () => void {
  // Cliente simulado en pruebas (sin `getSession`): nada que envolver.
  if (typeof auth?.getSession !== 'function') return () => undefined;
  const original = auth.getSession.bind(auth) as AuthLike['getSession'];
  const waitMs = deps.waitMs ?? AUTH_REFRESH_WAIT_MS;

  auth.getSession = async () => {
    const stored = await deps.readStoredSession().catch(() => null);
    if (!stored || !sessionNeedsRefresh(stored, deps.now?.() ?? Date.now())) return original();

    const storedResult: GetSessionResult = { data: { session: stored }, error: null };
    if (!deps.isOnline()) return storedResult;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const fallback = new Promise<GetSessionResult>((resolve) => {
      timer = setTimeout(() => resolve(storedResult), waitMs);
    });
    // El refresco sigue aunque gane la espera; sus errores ya los maneja auth-js.
    const refreshed = original().catch((error: unknown) => ({ data: { session: null }, error }));
    try {
      return await Promise.race([refreshed, fallback]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  return () => {
    auth.getSession = original;
  };
}
