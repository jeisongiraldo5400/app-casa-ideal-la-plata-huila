import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  changePassword: (newPassword: string) => Promise<{ error: any }>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      let verifiedUser: User | null = null;
      if (!error && session) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          await supabase.auth.signOut();
        } else {
          const { data: activeProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userData.user.id)
            .is('deleted_at', null)
            .maybeSingle();
          if (!profileError && activeProfile) verifiedUser = userData.user;
          else await supabase.auth.signOut();
        }
      }

      if (error || (session && !verifiedUser)) {
        console.log('Auth error during initialization:', error?.message || 'sesión o perfil inválido');
        await supabase.auth.signOut();
        set({ session: null, user: null, loading: false, initialized: true });
      } else {
        set({
          session: session && verifiedUser ? { ...session, user: verifiedUser } : null,
          user: verifiedUser,
          loading: false,
          initialized: true,
        });
      }

      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (event === 'TOKEN_REFRESHED' && !nextSession) {
          set({ session: null, user: null, loading: false });
        } else {
          set({
            session: nextSession,
            user: nextSession?.user ?? null,
            loading: false,
          });
        }
      });
      authSubscription = subscription;
    } catch (error: any) {
      console.log('Error initializing auth:', error?.message || error);
      if (
        error?.message?.includes('Refresh Token') ||
        error?.message?.includes('Invalid Refresh Token')
      ) {
        await supabase.auth.signOut();
      }
      set({ session: null, user: null, loading: false, initialized: true });
    }
  },

  cleanup: () => {
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }
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
    return { error };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  changePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  },
}));
