import { PermissionsAndroid, Platform } from 'react-native';

export async function ensureAndroidBluetoothPermissions() {
  if (Platform.OS !== 'android') return;

  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const permissions =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(permissions);
  const denied = permissions.filter((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length) {
    throw new Error(
      'Permita Bluetooth (dispositivos cercanos) y ubicación en Android para buscar y conectar la impresora.'
    );
  }
}
