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

/**
 * Tiempo límite de una petición al servidor. Con señal débil (el caso de campo:
 * datos que "conectan" pero no fluyen) `fetch` puede quedarse colgado minutos:
 * sin este corte la app gira indefinidamente y nunca cae al camino sin conexión.
 */
export const SUPABASE_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Mensaje del corte por tiempo, en castellano llano porque puede llegar a
 * verse en la cola de sincronización. `isNetworkError` (sessionPolicy) y
 * `classifyPushError` (retryPolicy) reconocen este texto y lo tratan como «no
 * se pudo enviar», nunca como un rechazo del servidor.
 */
export const REQUEST_TIMEOUT_MESSAGE = 'La red no respondió a tiempo.';

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return String((input as Request)?.url || '');
}

/**
 * Las subidas y descargas de archivos (soportes de pago, firmas) viajan por
 * Storage y pueden tardar mucho más que una consulta con una foto de varios MB
 * en 2G. Cortarlas a los 10 s dejaría soportes sin subir, así que quedan sin
 * tiempo límite: su carril de la cola las reintenta igual.
 */
function isStorageRequest(url: string): boolean {
  return url.includes('/storage/v1/');
}

/** `fetch` con `AbortController` y tiempo límite, salvo para Storage. */
export function createTimeoutFetch(
  baseFetch: typeof fetch = fetch,
  timeoutMs: number = SUPABASE_REQUEST_TIMEOUT_MS
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isStorageRequest(requestUrl(input))) return baseFetch(input, init);

    const controller = new AbortController();
    const externalSignal = init?.signal;
    const abortFromCaller = () => controller.abort();
    externalSignal?.addEventListener?.('abort', abortFromCaller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      // El `AbortError` de un corte propio llega con un texto que no parece de
      // red; se traduce para que la app lo trate como falta de conexión.
      if (timedOut) throw new Error(REQUEST_TIMEOUT_MESSAGE);
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.('abort', abortFromCaller);
    }
  };
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
  global: {
    fetch: createTimeoutFetch(),
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
