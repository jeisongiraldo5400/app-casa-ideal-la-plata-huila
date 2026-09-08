import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { logHandledError } from '@/lib/errorMessage';
import { createIdempotencyKey } from '@/lib/idempotency';
import {
  SECURE_KEYS,
  deleteSecureKey,
  getSecureJson,
  setSecureJson,
} from '@/lib/offline/security/secureKeys';

/**
 * Registro del dispositivo para recibir notificaciones.
 *
 * Nada de esto es crítico: si el usuario no da permiso, si es un emulador o si
 * no hay red, la app funciona igual y solo se queda sin avisos. Por eso ninguna
 * función lanza — se anota con `logHandledError`, que degrada las caídas de red
 * a aviso para no levantar la pantalla roja de desarrollo.
 */

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'skipped'; reason: 'emulator' | 'denied' | 'no_project_id' | 'error' };

/** Identificador estable del aparato. Se genera una vez y vive en el almacén seguro. */
async function getDeviceKey(): Promise<string | null> {
  try {
    const stored = await getSecureJson<string>(SECURE_KEYS.pushDeviceKey);
    if (stored) return stored;
    const created = createIdempotencyKey();
    await setSecureJson(SECURE_KEYS.pushDeviceKey, created);
    return created;
  } catch {
    return null;
  }
}

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/** El canal de Android decide cómo suena y se muestra el aviso. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Avisos de operación',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1e3a8a',
  });
}

export async function registerPushDevice(): Promise<PushRegistrationResult> {
  try {
    if (!Device.isDevice) {
      // Los emuladores no reciben push: registrar su token solo ensucia la tabla.
      return { status: 'skipped', reason: 'emulator' };
    }

    const projectId = getProjectId();
    if (!projectId) {
      logHandledError(
        'No se pudo registrar el dispositivo para notificaciones',
        new Error('Falta extra.eas.projectId en la configuración de la app')
      );
      return { status: 'skipped', reason: 'no_project_id' };
    }

    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain !== false) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return { status: 'skipped', reason: 'denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return { status: 'skipped', reason: 'error' };

    const deviceKey = await getDeviceKey();
    const { error } = await supabase.rpc('register_push_device', {
      p_expo_push_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_device_key: deviceKey,
      p_app_version: Constants.expoConfig?.version ?? null,
    });
    if (error) throw error;

    // Se guarda para poder darlo de baja al cerrar sesión, cuando ya no hay
    // forma de volver a pedírselo al sistema operativo.
    await setSecureJson(SECURE_KEYS.pushToken, token);
    return { status: 'registered', token };
  } catch (error) {
    logHandledError('No se pudo registrar el dispositivo para notificaciones', error);
    return { status: 'skipped', reason: 'error' };
  }
}

/**
 * Da de baja el token al cerrar sesión, para que el siguiente usuario de este
 * teléfono no reciba los avisos del anterior. Se llama ANTES de `signOut`
 * porque el RPC necesita la sesión todavía viva.
 */
export async function unregisterPushDevice(): Promise<void> {
  try {
    const token = await getSecureJson<string>(SECURE_KEYS.pushToken);
    if (!token) return;
    const { error } = await supabase.rpc('deactivate_push_device', {
      p_expo_push_token: token,
    });
    if (error) throw error;
  } catch (error) {
    logHandledError('No se pudo dar de baja el dispositivo de notificaciones', error);
  } finally {
    await deleteSecureKey(SECURE_KEYS.pushToken).catch(() => undefined);
  }
}
