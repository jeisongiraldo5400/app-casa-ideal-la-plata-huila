import { Alert, Linking, type AlertButton } from 'react-native';
import { openCustomerWhatsAppChat, shareWithCustomerWhatsApp } from '../negocioWhatsAppShare';

let openURL: jest.SpyInstance;
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  openURL = jest.spyOn(Linking, 'openURL');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const buttonsOf = (call = 0) => alert.mock.calls[call][2] as AlertButton[];
const press = (call: number, text: string | RegExp) => {
  const button = buttonsOf(call).find((b) => (typeof text === 'string' ? b.text === text : text.test(b.text ?? '')));
  if (!button?.onPress) throw new Error(`Sin botón ${String(text)}`);
  button.onPress();
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

const base = {
  title: 'Compartir contrato',
  customerName: 'ANA GÓMEZ',
  message: 'Hola Ana.',
};

describe('shareWithCustomerWhatsApp', () => {
  it('con celular ofrece WhatsApp al chat del cliente y abre el enlace', async () => {
    openURL.mockResolvedValueOnce(true);
    const sharePdf = jest.fn();

    expect(shareWithCustomerWhatsApp({ ...base, phone: '300 123 4567', phoneSecondary: null, sharePdf })).toBe('menu');
    expect(alert).toHaveBeenCalledWith('Compartir contrato', 'ANA GÓMEZ · 300 123 4567', expect.any(Array));
    expect(buttonsOf().map((b) => b.text)).toEqual(['Cancelar', 'Compartir PDF…', 'WhatsApp a Ana']);

    press(0, 'WhatsApp a Ana');
    await flush();

    expect(openURL).toHaveBeenCalledWith('whatsapp://send?phone=573001234567&text=Hola%20Ana.');
    expect(sharePdf).not.toHaveBeenCalled();
  });

  it('la opción «Compartir PDF…» usa la hoja de compartir de siempre', () => {
    const sharePdf = jest.fn();
    shareWithCustomerWhatsApp({ ...base, phone: '3001234567', phoneSecondary: null, sharePdf });

    press(0, 'Compartir PDF…');

    expect(sharePdf).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('usa el teléfono 2 cuando el 1 es fijo', async () => {
    openURL.mockResolvedValueOnce(true);
    shareWithCustomerWhatsApp({ ...base, phone: '6012345678', phoneSecondary: '310 555 0101', sharePdf: jest.fn() });

    press(0, /^WhatsApp/);
    await flush();

    expect(openURL).toHaveBeenCalledWith('whatsapp://send?phone=573105550101&text=Hola%20Ana.');
  });

  it('sin celular avisa y ofrece solo el PDF', () => {
    const sharePdf = jest.fn();

    expect(shareWithCustomerWhatsApp({ ...base, phone: null, phoneSecondary: '4441234', sharePdf })).toBe('no-phone');
    expect(alert).toHaveBeenCalledWith('Compartir contrato', 'El cliente no tiene celular registrado.', expect.any(Array));
    expect(buttonsOf().map((b) => b.text)).toEqual(['Cancelar', 'Compartir PDF']);

    press(0, 'Compartir PDF');
    expect(sharePdf).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe('openCustomerWhatsAppChat', () => {
  it('sin WhatsApp instalado avisa y cae a la hoja de compartir', async () => {
    openURL.mockRejectedValueOnce(new Error('No app'));
    const sharePdf = jest.fn();

    await expect(openCustomerWhatsAppChat('573001234567', 'Hola', sharePdf)).resolves.toBe(false);

    expect(alert).toHaveBeenCalledWith('WhatsApp no está instalado', expect.any(String), expect.any(Array));
    press(0, 'Compartir PDF');
    expect(sharePdf).toHaveBeenCalledTimes(1);
  });

  it('con WhatsApp abre el chat y no avisa', async () => {
    openURL.mockResolvedValueOnce(true);
    await expect(openCustomerWhatsAppChat('573001234567', 'Hola', jest.fn())).resolves.toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });
});
