import { supabase } from '@/lib/supabase';
import { useSyncStore } from '../store/syncStore';

/**
 * Id del usuario SIN pedirlo al servidor.
 *
 * `supabase.auth.getUser()` hace una petición de red: sin señal devuelve error
 * y tumbaba pasos que sólo necesitaban saber quién es el usuario (crear el
 * negocio, subir la firma). La sesión ya está en el teléfono: el motor de
 * sincronización la publica en `syncStore` al iniciar sesión y, si por lo que
 * sea no está ahí, se lee la sesión guardada (almacenamiento local).
 */
export async function getLocalUserId(): Promise<string | null> {
  const fromStore = useSyncStore.getState().userId;
  if (fromStore) return fromStore;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Igual que `getLocalUserId`, pero exige sesión: se usa antes de escribir. */
export async function requireLocalUserId(): Promise<string> {
  const userId = await getLocalUserId();
  if (!userId) throw new Error('Sesión no válida');
  return userId;
}
