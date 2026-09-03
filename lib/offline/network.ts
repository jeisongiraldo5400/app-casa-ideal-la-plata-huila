import type { NetInfoState } from '@react-native-community/netinfo';

/**
 * Criterio único de conectividad para la app: solo se considera sin red cuando
 * NetInfo lo afirma. Un estado desconocido (null / reachability aún no
 * evaluada) se trata como conectado para no bloquear la sincronización.
 */
export function isNetInfoOnline(state: NetInfoState | null | undefined): boolean {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}
