import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { contractPdfFileName, receiptPdfFileName, sanitizePdfFileName, sharePdf } from '../sharePdf';

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

const shareAsync = jest.mocked(Sharing.shareAsync);
const copyAsync = jest.mocked(FileSystem.copyAsync);

const NAMED_URI = 'file:///cache/documentos-pdf/Recibo%20RV-1%20-%20Ana%20Gomez.pdf';
const input = {
  uri: 'file:///cache/Print/abc.pdf',
  fileName: 'Recibo RV-1 - Ana Gómez',
  dialogTitle: 'RV-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
});

describe('sharePdf', () => {
  it('abre la hoja de compartir con el PDF renombrado', async () => {
    await expect(sharePdf(input)).resolves.toBe('share-sheet');
    expect(copyAsync).toHaveBeenCalledWith({ from: input.uri, to: NAMED_URI });
    expect(shareAsync).toHaveBeenCalledWith(
      NAMED_URI,
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'RV-1' })
    );
  });

  it('si no se puede renombrar, comparte el PDF original', async () => {
    copyAsync.mockRejectedValueOnce(new Error('disk'));
    await sharePdf(input);
    expect(shareAsync).toHaveBeenCalledWith(input.uri, expect.any(Object));
  });

  it('sin hoja de compartir devuelve «unavailable»', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(sharePdf(input)).resolves.toBe('unavailable');
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
