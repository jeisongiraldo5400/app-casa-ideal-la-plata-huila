import { Alert, Linking } from 'react-native';
import { shareLinkByWhatsApp } from '../shareActions';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const MESSAGE = 'Hola Ana. Te comparto este catálogo de Casa Ideal: https://catalogo.test/c/tok';

let openURL: jest.SpyInstance;
let canOpenURL: jest.SpyInstance;
let alert: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL');
  canOpenURL = jest.spyOn(Linking, 'canOpenURL');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('shareLinkByWhatsApp', () => {
  it('abre primero la app de WhatsApp', async () => {
    openURL.mockResolvedValueOnce(true);

    await expect(shareLinkByWhatsApp(MESSAGE)).resolves.toBe('app');

    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(`whatsapp://send?text=${encodeURIComponent(MESSAGE)}`);
    // `canOpenURL` no sirve: con https siempre dice que sí.
    expect(canOpenURL).not.toHaveBeenCalled();
  });

  it('sin la app cae a wa.me', async () => {
    openURL.mockRejectedValueOnce(new Error('Unable to open URL')).mockResolvedValueOnce(true);

    await expect(shareLinkByWhatsApp(MESSAGE)).resolves.toBe('web');

    expect(openURL).toHaveBeenLastCalledWith(`https://wa.me/?text=${encodeURIComponent(MESSAGE)}`);
    expect(alert).not.toHaveBeenCalled();
  });

  it('si nada abre, avisa sin mostrar la URL (lleva el token)', async () => {
    openURL.mockRejectedValue(new Error(`Unable to open URL: https://wa.me/?text=${encodeURIComponent(MESSAGE)}`));

    await expect(shareLinkByWhatsApp(MESSAGE)).resolves.toBe('unavailable');

    expect(alert).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(alert.mock.calls[0])).not.toContain('tok');
  });
});
