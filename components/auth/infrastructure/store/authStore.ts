import { readStoredSession, supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import {
  getLastOnlineVerifiedAt,
  setLastOnlineVerifiedAt,
} from '@/lib/offline/security/secureKeys';
import { shouldKeepLocalSession } from '@/lib/offline/security/sessionPolicy';
import { wipeLocalOfflineData } from '@/lib/offline/security/wipe';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  offlineSession: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  clearLocalAuth: () => void;
  changePassword: (newPassword: string) => Promise<{ error: any }>;
}

let authSubscription: { unsubscribe: () => void } | null = null;
let authBootstrapping = false;
const AUTH_INIT_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Conserva la sesión guardada cuando la verificación falló por falta de red
 * (getSession con token vencido, timeout) y el último acceso verificado está
 * dentro del TTL offline. Devuelve true si se restauró.
 */
async function restoreOfflineSession(
  error: unknown,
  set: (partial: Partial<AuthState>) => void
): Promise<boolean> {
  const stored = await readStoredSession();
  const lastVerified = await getLastOnlineVerifiedAt();
  if (
    !stored ||
    !shouldKeepLocalSession({
      error,
      hasStoredSession: true,
      lastOnlineVerifiedAt: lastVerified,
    })
  ) {
    return false;
  }
  console.warn('No se pudo verificar la sesión; se conserva la sesión local', error);
  set({
    session: stored,
    user: stored.user,
    loading: false,
    initialized: true,
    offlineSession: true,
  });
  return true;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,
  offlineSession: false,

  initialize: async () => {
    if (get().initialized) return;

    authBootstrapping = true;
    try {
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        // initialize() already restores and verifies the session. Events
        // during bootstrap (including INITIAL_SESSION) must not promote a
        // cached JWT before getUser() + profile checks finish.
        if (authBootstrapping || event === 'INITIAL_SESSION') return;
        if (event === 'TOKEN_REFRESHED' && !nextSession) {
          set({ session: null, user: null, loading: false, offlineSession: false });
        } else if (event === 'TOKEN_REFRESHED' && nextSession) {
          void setLastOnlineVerifiedAt();
          set({
            session: nextSession,
            user: nextSession.user ?? null,
            loading: false,
            offlineSession: false,
          });
        } else {
          set({
            session: nextSession,
            user: nextSession?.user ?? null,
            loading: false,
            offlineSession: false,
          });
        }
      });
      authSubscription = subscription;

      const {
        data: { session },
        error,
      } = await withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS, 'getSession');

      if (error || !session) {
        // auth-js devuelve session null cuando el access token venció y el
        // refresh falla por red, aunque la sesión siga guardada. Sin red se
        // conserva la sesión local dentro del TTL offline.
        if (error && (await restoreOfflineSession(error, set))) return;
        set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
        return;
      }

      try {
        const { data: userData, error: userError } = await withTimeout(
          supabase.auth.getUser(),
          AUTH_INIT_TIMEOUT_MS,
          'getUser',
        );
        if (userError) throw userError;
        if (!userData.user) {
          await supabase.auth.signOut();
          set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
          return;
        }

        const { data: activeProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', userData.user.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!activeProfile) {
          await supabase.auth.signOut();
          await wipeLocalOfflineData();
          set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
          return;
        }

        await setLastOnlineVerifiedAt();
        set({
          session: { ...session, user: userData.user },
          user: userData.user,
          loading: false,
          initialized: true,
          offlineSession: false,
        });
      } catch (verifyError) {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        const lastVerified = await getLastOnlineVerifiedAt();
        if (
          shouldKeepLocalSession({
            error: verifyError,
            hasStoredSession: Boolean(currentSession),
            lastOnlineVerifiedAt: lastVerified,
          })
        ) {
          const kept = currentSession ?? session;
          console.warn('No se pudo verificar la sesión; se conserva la sesión local', verifyError);
          set({
            session: kept,
            user: kept.user,
            loading: false,
            initialized: true,
            offlineSession: true,
          });
          return;
        }

        await supabase.auth.signOut();
        set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
      }
    } catch (error: any) {
      console.log('Error initializing auth:', error?.message || error);
      if (
        error?.message?.includes('Refresh Token') ||
        error?.message?.includes('Invalid Refresh Token')
      ) {
        await supabase.auth.signOut();
      } else if (await restoreOfflineSession(error, set)) {
        return;
      }
      set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
    } finally {
      authBootstrapping = false;
      if (!get().initialized) {
        set({ loading: false, initialized: true });
      }
    }
  },

  cleanup: () => {
    authBootstrapping = false;
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }
  },

  clearLocalAuth: () => {
    set({ session: null, user: null, loading: false, offlineSession: false });
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) return { error };
    const { data: activeProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (profileError || !activeProfile) {
      await supabase.auth.signOut();
      return { error: new Error('La cuenta está inactiva o fue eliminada') };
    }
    await setLastOnlineVerifiedAt();
    if (data.session) {
      set({
        session: data.session,
        user: data.user,
        loading: false,
        offlineSession: false,
      });
    }
    return { error };
  },

  signOut: async () => {
    await wipeLocalOfflineData();
    await supabase.auth.signOut();
    set({ session: null, user: null, offlineSession: false });
  },

  changePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  },
}));
