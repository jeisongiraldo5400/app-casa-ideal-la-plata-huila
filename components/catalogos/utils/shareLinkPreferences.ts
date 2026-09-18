import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SHARE_LINK_HOURS, parseStoredShareLinkHours } from '@/lib/catalogos/shareLinks';

// Última vigencia elegida al generar o reemitir un enlace. Es una comodidad
// por dispositivo: si el almacenamiento falla, se usan 7 días.
const SHARE_LINK_HOURS_KEY = 'catalogos.shareLinkHours';

export async function loadShareLinkHours(): Promise<number> {
  try {
    return parseStoredShareLinkHours(await AsyncStorage.getItem(SHARE_LINK_HOURS_KEY));
  } catch {
    return DEFAULT_SHARE_LINK_HOURS;
  }
}

export async function saveShareLinkHours(hours: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SHARE_LINK_HOURS_KEY, String(parseStoredShareLinkHours(String(hours))));
  } catch {
    // Sin persistencia la próxima vez vuelve a 7 días; no es un error para el usuario.
  }
}
