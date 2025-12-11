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
  changePassword: (newPassword: string) => Promise<{ error: any }>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      // Get initial session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      // If there's an error with refresh token, clear the session
      if (error) {
        console.log('Auth error during initialization:', error.message);
        // Clear invalid session
        await supabase.auth.signOut();
        set({ session: null, user: null, loading: false, initialized: true });
      } else {
        set({ session, user: session?.user ?? null, loading: false, initialized: true });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        // Handle token refresh errors
        if (event === 'TOKEN_REFRESHED' && !session) {
          // If token refresh failed, clear the session
          set({ session: null, user: null, loading: false });
        } else {
          set({ session, user: session?.user ?? null, loading: false });
        }
      });
    } catch (error: any) {
      console.log('Error initializing auth:', error?.message || error);
      // If there's an invalid refresh token error, clear the session
      if (error?.message?.includes('Refresh Token') || error?.message?.includes('Invalid Refresh Token')) {
        await supabase.auth.signOut();
      }
      set({ session: null, user: null, loading: false, initialized: true });
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

