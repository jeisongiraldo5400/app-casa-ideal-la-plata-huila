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

      if (error) {
        console.log('Auth error during initialization:', error.message);
        await supabase.auth.signOut();
        set({ session: null, user: null, loading: false, initialized: true });
      } else {
        set({
          session,
          user: session?.user ?? null,
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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
