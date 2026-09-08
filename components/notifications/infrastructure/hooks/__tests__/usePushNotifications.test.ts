import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { usePushNotifications } from '../usePushNotifications';
import { registerPushDevice } from '../../services/pushDeviceService';
import { kickNotificationDispatch } from '../../services/dispatchNotifications';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const authState = { isAuthenticated: true, user: { id: 'user-1' } as { id: string } | null };
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

jest.mock('../../services/pushDeviceService', () => ({
  registerPushDevice: jest.fn(),
}));

jest.mock('../../services/dispatchNotifications', () => ({
  kickNotificationDispatch: jest.fn(),
}));

const mockedRegister = registerPushDevice as jest.Mock;
const mockedAddTokenListener = Notifications.addPushTokenListener as jest.Mock;

/** Captura el callback del listener de token para poder dispararlo a mano. */
function captureTokenListener() {
  let handler: ((event: { data: string }) => void) | null = null;
  mockedAddTokenListener.mockImplementation((cb: (event: { data: string }) => void) => {
    handler = cb;
    return { remove: jest.fn() };
  });
  return () => handler;
}

describe('usePushNotifications — registro del dispositivo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
  });

  it('registra una sola vez aunque el sistema emita el token durante la registración', async () => {
    const getHandler = captureTokenListener();
    // getExpoPushTokenAsync dispara el evento de token mientras la registración
    // sigue en vuelo: antes eso reiniciaba el throttle y volvía a llamar,
    // encadenando una docena de peticiones en el mismo segundo.
    mockedRegister.mockImplementation(async () => {
      getHandler()?.({ data: 'apns-token-1' });
      getHandler()?.({ data: 'apns-token-1' });
      return { status: 'registered', token: 'ExponentPushToken[a]' };
    });

    renderHook(() => usePushNotifications());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRegister).toHaveBeenCalledTimes(1);
  });

  it('sí vuelve a registrar cuando el token del sistema cambia de verdad', async () => {
    const getHandler = captureTokenListener();
    mockedRegister.mockResolvedValue({ status: 'registered', token: 'ExponentPushToken[a]' });

    renderHook(() => usePushNotifications());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedRegister).toHaveBeenCalledTimes(1);

    // Primer aviso: es el token que la registración en curso ya subió.
    await act(async () => {
      getHandler()?.({ data: 'apns-token-1' });
      await Promise.resolve();
    });
    expect(mockedRegister).toHaveBeenCalledTimes(1);

    // Rotación real del token: ahora sí hay que volver a subirlo.
    await act(async () => {
      getHandler()?.({ data: 'apns-token-2' });
      await Promise.resolve();
    });
    expect(mockedRegister).toHaveBeenCalledTimes(2);
  });

  it('sin sesión no registra nada', async () => {
    captureTokenListener();
    authState.isAuthenticated = false;
    authState.user = null;
    mockedRegister.mockResolvedValue({ status: 'registered', token: 'x' });

    renderHook(() => usePushNotifications());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRegister).not.toHaveBeenCalled();
  });
});

describe('usePushNotifications — empujón tras registrarse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.isAuthenticated = true;
    authState.user = { id: 'user-1' };
  });

  it('pide el despacho en cuanto el dispositivo queda registrado', async () => {
    captureTokenListener();
    mockedRegister.mockResolvedValue({ status: 'registered', token: 'ExponentPushToken[a]' });

    renderHook(() => usePushNotifications());
    await act(async () => {
      await Promise.resolve();
    });

    expect(kickNotificationDispatch).toHaveBeenCalledTimes(1);
  });

  it('no pide nada si el registro se omitió', async () => {
    captureTokenListener();
    mockedRegister.mockResolvedValue({ status: 'skipped', reason: 'denied' });

    renderHook(() => usePushNotifications());
    await act(async () => {
      await Promise.resolve();
    });

    expect(kickNotificationDispatch).not.toHaveBeenCalled();
  });
});
