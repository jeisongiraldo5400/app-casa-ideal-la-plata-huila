import { useAuthStore } from '../store/authStore';

/**
 * Hook personalizado para acceder al estado y funciones de autenticación
 */
export function useAuth() {
  const session = useAuthStore((state) => state.session);
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const initialized = useAuthStore((state) => state.initialized);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const initialize = useAuthStore((state) => state.initialize);

  return {
    session,
    user,
    loading,
    initialized,
    signIn,
    signOut,
    initialize,
    isAuthenticated: !!session,
  };
}

