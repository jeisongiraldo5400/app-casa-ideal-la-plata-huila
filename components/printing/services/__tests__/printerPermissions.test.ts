import { PermissionsAndroid, Platform } from 'react-native';
import { bluetoothPermissionsFor, ensureAndroidBluetoothPermissions } from '../printerPermissions';

const { ACCESS_FINE_LOCATION, BLUETOOTH_CONNECT, BLUETOOTH_SCAN } = PermissionsAndroid.PERMISSIONS;

describe('permisos de la impresora Bluetooth', () => {
  it('Android 12+ pide solo «dispositivos cercanos», sin ubicación', () => {
    expect(bluetoothPermissionsFor(31)).toEqual([BLUETOOTH_SCAN, BLUETOOTH_CONNECT]);
    expect(bluetoothPermissionsFor(34)).not.toContain(ACCESS_FINE_LOCATION);
  });

  it('hasta Android 11 pide ubicación, que la búsqueda Bluetooth exige', () => {
    expect(bluetoothPermissionsFor(30)).toEqual([ACCESS_FINE_LOCATION]);
    expect(bluetoothPermissionsFor(23)).toEqual([ACCESS_FINE_LOCATION]);
  });

  describe('ensureAndroidBluetoothPermissions', () => {
    const originalOS = Platform.OS;
    const originalVersion = Platform.Version;

    const setPlatform = (os: string, version: number) => {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
    };

    afterEach(() => {
      setPlatform(originalOS, originalVersion as number);
      jest.restoreAllMocks();
    });

    it('en Android 13 no solicita ubicación y concede con «dispositivos cercanos»', async () => {
      setPlatform('android', 33);
      const request = jest
        .spyOn(PermissionsAndroid, 'requestMultiple')
        .mockResolvedValue({ [BLUETOOTH_SCAN]: 'granted', [BLUETOOTH_CONNECT]: 'granted' } as never);

      await expect(ensureAndroidBluetoothPermissions()).resolves.toBeUndefined();
      expect(request).toHaveBeenCalledWith([BLUETOOTH_SCAN, BLUETOOTH_CONNECT]);
    });

    it('si niega, explica qué permiso falta', async () => {
      setPlatform('android', 33);
      jest
        .spyOn(PermissionsAndroid, 'requestMultiple')
        .mockResolvedValue({ [BLUETOOTH_SCAN]: 'denied', [BLUETOOTH_CONNECT]: 'granted' } as never);

      await expect(ensureAndroidBluetoothPermissions()).rejects.toThrow('Dispositivos cercanos');
    });

    it('en iOS no pide nada', async () => {
      setPlatform('ios', 17);
      const request = jest.spyOn(PermissionsAndroid, 'requestMultiple');
      await ensureAndroidBluetoothPermissions();
      expect(request).not.toHaveBeenCalled();
    });
  });
});
