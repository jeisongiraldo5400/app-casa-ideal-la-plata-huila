import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { registerPushDevice, unregisterPushDevice } from '../pushDeviceService';
import { SECURE_KEYS, getSecureJson } from '@/lib/offline/security/secureKeys';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(async () => ({ data: 'device-1', error: null })) },
}));

// Almacén seguro en memoria: el mock global de expo-secure-store devuelve
// siempre null, y aquí hace falta que el token persista entre llamadas.
jest.mock('@/lib/offline/security/secureKeys', () => {
  const store = new Map<string, unknown>();
  return {
    SECURE_KEYS: {
      pushDeviceKey: 'casa_ideal.push_device_key',
      pushToken: 'casa_ideal.push_token',
    },
    getSecureJson: jest.fn(async (key: string) => store.get(key) ?? null),
    setSecureJson: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    deleteSecureKey: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '2.0.1', extra: { eas: { projectId: 'proyecto-1' } } },
  },
}));

const mockedRpc = supabase.rpc as unknown as jest.Mock;
const mockedDevice = Device as unknown as { isDevice: boolean };
const mockedNotifications = Notifications as unknown as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
};

describe('registerPushDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDevice.isDevice = true;
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockedRpc.mockResolvedValue({ data: 'device-1', error: null });
  });

  it('registra el token con su plataforma y versión', async () => {
    const result = await registerPushDevice();

    expect(result).toEqual({ status: 'registered', token: 'ExponentPushToken[abc]' });
    expect(mockedRpc).toHaveBeenCalledWith(
      'register_push_device',
      expect.objectContaining({
        p_expo_push_token: 'ExponentPushToken[abc]',
        p_app_version: '2.0.1',
      })
    );
  });

  it('guarda el token para poder darlo de baja al cerrar sesión', async () => {
    await registerPushDevice();
    await expect(getSecureJson<string>(SECURE_KEYS.pushToken)).resolves.toBe(
      'ExponentPushToken[abc]'
    );
  });

  it('en un emulador no registra nada: solo ensuciaría la tabla', async () => {
    mockedDevice.isDevice = false;
    await expect(registerPushDevice()).resolves.toEqual({
      status: 'skipped',
      reason: 'emulator',
    });
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('si el usuario niega el permiso no se pide token', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(registerPushDevice()).resolves.toEqual({ status: 'skipped', reason: 'denied' });
    expect(mockedNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('no vuelve a preguntar si el sistema ya no lo permite', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });

    await expect(registerPushDevice()).resolves.toEqual({ status: 'skipped', reason: 'denied' });
    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('un fallo de red no lanza: la app funciona sin avisos', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await expect(registerPushDevice()).resolves.toEqual({ status: 'skipped', reason: 'error' });
  });
});

describe('unregisterPushDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRpc.mockResolvedValue({ data: null, error: null });
  });

  it('da de baja el token guardado', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockedRpc.mockResolvedValue({ data: 'device-1', error: null });
    await registerPushDevice();
    mockedRpc.mockClear();

    await unregisterPushDevice();

    expect(mockedRpc).toHaveBeenCalledWith('deactivate_push_device', {
      p_expo_push_token: 'ExponentPushToken[abc]',
    });
  });

  it('sin token guardado no llama al servidor', async () => {
    await unregisterPushDevice();
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('un fallo del servidor no impide continuar con el cierre de sesión', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockedRpc.mockResolvedValue({ data: 'device-1', error: null });
    await registerPushDevice();
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });

    await expect(unregisterPushDevice()).resolves.toBeUndefined();
  });
});
