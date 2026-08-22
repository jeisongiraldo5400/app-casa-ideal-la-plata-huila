import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'
import { AppState, type AppStateStatus, Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL environment variable')
}

if (!supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

const secureSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureSessionStorage,
    // En React Native el refresco se controla con AppState. Dejar el
    // temporizador siempre activo hace que iOS intente leer el llavero cuando
    // el dispositivo esta bloqueado y SecureStore no permite interacción.
    autoRefreshToken: Platform.OS === 'web',
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/**
 * Mantiene el refresco de la sesión activo solamente mientras la aplicación
 * nativa está en primer plano. Debe montarse una sola vez en el layout raíz.
 */
export function startSupabaseAuthLifecycle(): () => void {
  if (Platform.OS === 'web') return () => undefined

  const updateAutoRefresh = (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
      return
    }

    supabase.auth.stopAutoRefresh()
  }

  updateAutoRefresh(AppState.currentState)
  const subscription = AppState.addEventListener('change', updateAutoRefresh)

  return () => {
    subscription.remove()
    supabase.auth.stopAutoRefresh()
  }
}
