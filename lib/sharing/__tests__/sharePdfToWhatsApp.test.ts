import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Share from 'react-native-share';
import {
  contractPdfFileName,
  receiptPdfFileName,
  sanitizePdfFileName,
  sharePdfToWhatsApp,
} from '../sharePdfToWhatsApp';

jest.mock('react-native-share');
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const isInstalled = jest.mocked(Share.isPackageInstalled);
const shareSingle = jest.mocked(Share.shareSingle);
const shareAsync = jest.mocked(Sharing.shareAsync);
const copyAsync = jest.mocked(FileSystem.copyAsync);

const NAMED_URI = 'file:///cache/documentos-pdf/Recibo%20RV-1%20-%20Ana%20Gomez.pdf';
const input = {
  uri: 'file:///cache/Print/abc.pdf',
  fileName: 'Recibo RV-1 - Ana Gómez',
  phone: '300 123 4567',
  phoneSecondary: null,
  dialogTitle: 'RV-1',
};

const installed = (...packages: string[]) =>
  isInstalled.mockImplementation(async (name: string) => ({ isInstalled: packages.includes(name), message: '' }));

beforeEach(() => {
  jest.clearAllMocks();
  installed('com.whatsapp');
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
});

describe('sharePdfToWhatsApp en Android', () => {
  it('abre WhatsApp en el chat del cliente con el PDF con nombre claro', async () => {
    await expect(sharePdfToWhatsApp(input, 'android')).resolves.toBe('whatsapp');

    expect(copyAsync).toHaveBeenCalledWith({ from: input.uri, to: NAMED_URI });
    expect(shareSingle).toHaveBeenCalledWith({
      social: Share.Social.WHATSAPP,
      whatsAppNumber: '573001234567',
      url: NAMED_URI,
      type: 'application/pdf',
      filename: 'Recibo RV-1 - Ana Gomez',
    });
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('usa WhatsApp Business si WhatsApp no está instalado', async () => {
    installed('com.whatsapp.w4b');
    await expect(sharePdfToWhatsApp(input, 'android')).resolves.toBe('whatsapp-business');
    expect(shareSingle).toHaveBeenCalledWith(expect.objectContaining({ social: Share.Social.WHATSAPPBUSINESS }));
  });

  it('usa el teléfono 2 cuando el 1 es fijo', async () => {
    await sharePdfToWhatsApp({ ...input, phone: '6018765432', phoneSecondary: '310 555 0101' }, 'android');
    expect(shareSingle).toHaveBeenCalledWith(expect.objectContaining({ whatsAppNumber: '573105550101' }));
  });

  it('sin celular válido abre la hoja de compartir con el PDF', async () => {
    await expect(sharePdfToWhatsApp({ ...input, phone: '4441234' }, 'android')).resolves.toBe('share-sheet');
    expect(isInstalled).not.toHaveBeenCalled();
    expect(shareSingle).not.toHaveBeenCalled();
    expect(shareAsync).toHaveBeenCalledWith(NAMED_URI, expect.objectContaining({ mimeType: 'application/pdf', dialogTitle: 'RV-1' }));
  });

  it('sin ninguna app de WhatsApp abre la hoja de compartir', async () => {
    installed();
    await expect(sharePdfToWhatsApp(input, 'android')).resolves.toBe('share-sheet');
    expect(shareSingle).not.toHaveBeenCalled();
    expect(shareAsync).toHaveBeenCalledWith(NAMED_URI, expect.any(Object));
  });

  it('si WhatsApp falla, cae a la hoja de compartir', async () => {
    shareSingle.mockRejectedValueOnce(new Error('Activity not found'));
    await expect(sharePdfToWhatsApp(input, 'android')).resolves.toBe('share-sheet');
    expect(shareAsync).toHaveBeenCalledTimes(1);
  });

  it('si no se puede renombrar, comparte el PDF original', async () => {
    copyAsync.mockRejectedValueOnce(new Error('disk'));
    await sharePdfToWhatsApp(input, 'android');
    expect(shareSingle).toHaveBeenCalledWith(expect.objectContaining({ url: input.uri }));
  });
});

describe('sharePdfToWhatsApp en iPhone', () => {
  it('siempre usa la hoja de compartir con el PDF renombrado', async () => {
    await expect(sharePdfToWhatsApp(input, 'ios')).resolves.toBe('share-sheet');
    expect(isInstalled).not.toHaveBeenCalled();
    expect(shareSingle).not.toHaveBeenCalled();
    expect(shareAsync).toHaveBeenCalledWith(NAMED_URI, expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }));
  });

  it('sin hoja de compartir devuelve «unavailable»', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(sharePdfToWhatsApp(input, 'ios')).resolves.toBe('unavailable');
    expect(shareAsync).not.toHaveBeenCalled();
  });
});

describe('nombres de archivo', () => {
  it('limpia tildes, caracteres reservados y espacios', () => {
    expect(sanitizePdfFileName('Recibo RV/12:3 - José Núñez?*')).toBe('Recibo RV 12 3 - Jose Nunez.pdf');
    expect(sanitizePdfFileName('  Contrato   1.pdf ')).toBe('Contrato 1.pdf');
    expect(sanitizePdfFileName('###')).toBe('Documento.pdf');
    expect(sanitizePdfFileName('a'.repeat(200))).toBe(`${'a'.repeat(80)}.pdf`);
  });

  it('recibo y contrato con el nombre del cliente', () => {
    expect(receiptPdfFileName('RV-000123', 'JUAN PÉREZ')).toBe('Recibo RV-000123 - Juan Perez.pdf');
    expect(contractPdfFileName(20260076, 'juan pérez')).toBe('Contrato 20260076 - Juan Perez.pdf');
  });

  it('sin cliente o sin número no deja guiones sueltos', () => {
    expect(receiptPdfFileName(null, 'Cliente')).toBe('Recibo.pdf');
    expect(contractPdfFileName(20260076, '')).toBe('Contrato 20260076.pdf');
  });
});
