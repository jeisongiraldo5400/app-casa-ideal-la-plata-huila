import { supabase } from '@/lib/supabase';
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

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,
  offlineSession: false,

  initialize: async () => {
    if (get().initialized) return;

    try {
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
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
      } = await supabase.auth.getSession();

      if (error || !session) {
        set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
        return;
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
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
      }
      set({ session: null, user: null, loading: false, initialized: true, offlineSession: false });
    }
  },

  cleanup: () => {
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
