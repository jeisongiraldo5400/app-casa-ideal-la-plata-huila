import type { Session } from '@supabase/supabase-js';
import {
  AUTH_REFRESH_WAIT_MS,
  installOfflineSessionGuard,
  sessionNeedsRefresh,
} from '../offlineSessionGuard';

/**
 * Pista del reporte «sin señal no se ve la orden descargada»: con el token de
 * acceso vencido (dura 1 h) cada consulta pasaba antes por el refresco de
 * auth-js, que reintenta ~25 s sin señal. Solo después fallaba la consulta y
 * la pantalla leía lo del teléfono.
 */

const NOW = Date.parse('2026-10-22T12:00:00Z');

function session(expiresInMs: number): Session {
  return {
    access_token: 'viejo',
    refresh_token: 'r',
    expires_at: Math.floor((NOW + expiresInMs) / 1000),
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'u1' } as Session['user'],
  };
}

/** `getSession` de auth-js con el refresco colgado en reintentos. */
function hangingAuth() {
  const getSession = jest.fn(() => new Promise<never>(() => undefined));
  return { auth: { getSession } as { getSession: () => Promise<any> }, getSession };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('sessionNeedsRefresh', () => {
  it('vencida o a menos de 90 s de vencer necesita refresco; vigente no', () => {
    expect(sessionNeedsRefresh(session(-60_000), NOW)).toBe(true);
    expect(sessionNeedsRefresh(session(30_000), NOW)).toBe(true);
    expect(sessionNeedsRefresh(session(30 * 60_000), NOW)).toBe(false);
  });
});

describe('installOfflineSessionGuard', () => {
  it('sin señal y con la sesión vencida no intenta refrescar: devuelve la guardada al instante', async () => {
    const { auth, getSession } = hangingAuth();
    const stored = session(-10 * 60_000);
    installOfflineSessionGuard(auth, { isOnline: () => false, readStoredSession: async () => stored, now: () => NOW });

    await expect(auth.getSession()).resolves.toEqual({ data: { session: stored }, error: null });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('con señal débil, si el refresco no termina, la consulta sigue con la guardada tras la espera', async () => {
    const { auth, getSession } = hangingAuth();
    const stored = session(-10 * 60_000);
    installOfflineSessionGuard(auth, { isOnline: () => true, readStoredSession: async () => stored, now: () => NOW });

    const pending = auth.getSession();
    await jest.advanceTimersByTimeAsync(AUTH_REFRESH_WAIT_MS);
    await expect(pending).resolves.toEqual({ data: { session: stored }, error: null });
    // El refresco sí se lanzó (se completa por su cuenta cuando haya red).
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('con señal, si el refresco responde, se usa lo que devuelve auth-js', async () => {
    const fresh = { data: { session: session(60 * 60_000) }, error: null };
    const auth = { getSession: jest.fn(async () => fresh) };
    installOfflineSessionGuard(auth, { isOnline: () => true, readStoredSession: async () => session(-1000), now: () => NOW });
    await expect(auth.getSession()).resolves.toBe(fresh);
  });

  it('con la sesión vigente no cambia nada, haya o no señal', async () => {
    const result = { data: { session: session(30 * 60_000) }, error: null };
    const auth = { getSession: jest.fn(async () => result) };
    installOfflineSessionGuard(auth, {
      isOnline: () => false,
      readStoredSession: async () => session(30 * 60_000),
      now: () => NOW,
    });
    await expect(auth.getSession()).resolves.toBe(result);
  });

  it('sin sesión guardada deja a auth-js decidir (no inventa sesiones)', async () => {
    const result = { data: { session: null }, error: null };
    const auth = { getSession: jest.fn(async () => result) };
    installOfflineSessionGuard(auth, { isOnline: () => false, readStoredSession: async () => null });
    await expect(auth.getSession()).resolves.toBe(result);
  });
});
