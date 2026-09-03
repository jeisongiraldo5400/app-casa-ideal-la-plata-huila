import * as SecureStore from 'expo-secure-store'
import { createClient, type Session } from '@supabase/supabase-js'
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
 * Sesión persistida tal como la guardó auth-js, sin intentar refrescarla.
 * `getSession()` devuelve null cuando el access token venció y el refresh
 * falla por red, aunque el refresh token siga guardado y sea válido. En modo
 * sin conexión esa sesión es la que mantiene al usuario dentro de la app.
 */
export async function readStoredSession(): Promise<Session | null> {
  const storageKey = (supabase.auth as unknown as { storageKey?: string }).storageKey
  if (!storageKey) return null
  try {
    const raw = await secureSessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) return null
    return parsed as Session
  } catch {
    return null
  }
}

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
