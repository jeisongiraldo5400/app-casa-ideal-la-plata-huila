import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Compartir un PDF (contrato o recibo): la hoja de compartir del sistema, igual
 * en Android y en iPhone; el vendedor elige WhatsApp, el chat u otra app.
 *
 * El archivo se copia con un nombre claro («Recibo RV-123 - Juan Perez.pdf»)
 * en la caché, que es la carpeta que lee expo-sharing.
 */

export type SharePdfOutcome = 'share-sheet' | 'unavailable';

export type SharePdfInput = {
  /** PDF de `Print.printToFileAsync`. */
  uri: string;
  /** Nombre visible del archivo, con o sin «.pdf» (se limpia). */
  fileName: string;
  /** Título de la hoja de compartir (Android). */
  dialogTitle?: string;
};

const PDF_DIR = 'documentos-pdf/';
const MAX_NAME_LENGTH = 80;

/**
 * Nombre de archivo seguro en Android, iOS y WhatsApp: sin tildes ni
 * caracteres reservados, espacios simples y terminado en «.pdf».
 */
export function sanitizePdfFileName(name: string): string {
  const base = name
    .trim()
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return `${base || 'Documento'}.pdf`;
}

/** «MARÍA JOSÉ PÉREZ» → «María José Pérez». */
function displayName(customerName: string | null | undefined): string {
  return (customerName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('es-CO') + word.slice(1).toLocaleLowerCase('es-CO'))
    .join(' ');
}

function documentFileName(label: string, code: string | number | null | undefined, customerName: string | null | undefined) {
  const head = [label, code == null ? '' : String(code).trim()].filter(Boolean).join(' ');
  const name = displayName(customerName);
  return sanitizePdfFileName(name && name.toLowerCase() !== 'cliente' ? `${head} - ${name}` : head);
}

/** «Recibo RV-000123 - Juan Perez.pdf». */
export function receiptPdfFileName(receiptNumber: string | null | undefined, customerName: string | null | undefined) {
  return documentFileName('Recibo', receiptNumber, customerName);
}

/** «Contrato 20260076 - Juan Perez.pdf». */
export function contractPdfFileName(negocioNumero: number | string | null | undefined, customerName: string | null | undefined) {
  return documentFileName('Contrato', negocioNumero, customerName);
}

/** Copia el PDF con su nombre claro; si falla, se comparte el original. */
async function namedCopy(uri: string, fileName: string): Promise<string> {
  try {
    const dir = `${FileSystem.cacheDirectory}${PDF_DIR}`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
    // Codificado: iOS no lee rutas con espacios sin escapar; Android lo decodifica.
    const target = `${dir}${encodeURIComponent(fileName)}`;
    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  } catch {
    return uri;
  }
}

async function shareSheet(uri: string, dialogTitle?: string): Promise<SharePdfOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle });
  return 'share-sheet';
}

export async function sharePdf(input: SharePdfInput): Promise<SharePdfOutcome> {
  const fileName = sanitizePdfFileName(input.fileName);
  const uri = await namedCopy(input.uri, fileName);
  return shareSheet(uri, input.dialogTitle);
}
