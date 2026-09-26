import { PermissionsAndroid, Platform, type Permission } from 'react-native';

/** Android 12 (API 31) separa Bluetooth en «dispositivos cercanos». */
const ANDROID_12_API = 31;

/**
 * Permisos que hay que pedir para buscar y conectar la impresora.
 *
 * En Android 12+ basta con «dispositivos cercanos»: el manifiesto declara
 * BLUETOOTH_SCAN con `neverForLocation` (plugins/withAndroidBluetoothPrinterPermissions),
 * así que pedir ubicación solo asustaba al usuario y, si la negaba, bloqueaba la
 * impresión sin necesidad. Hasta Android 11 la búsqueda Bluetooth sí exige ubicación.
 */
export function bluetoothPermissionsFor(apiLevel: number): Permission[] {
  return apiLevel >= ANDROID_12_API
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
}

export function bluetoothPermissionDeniedMessage(apiLevel: number): string {
  return apiLevel >= ANDROID_12_API
    ? 'Permita «Dispositivos cercanos» (Bluetooth) en Android para buscar y conectar la impresora.'
    : 'Permita la ubicación en Android: hasta Android 11 es necesaria para buscar la impresora por Bluetooth.';
}

export async function ensureAndroidBluetoothPermissions() {
  if (Platform.OS !== 'android') return;

  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const permissions = bluetoothPermissionsFor(api);

  const result = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.filter((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length) {
    throw new Error(bluetoothPermissionDeniedMessage(api));
  }
}
