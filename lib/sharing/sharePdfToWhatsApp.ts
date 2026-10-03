import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type RNShare from 'react-native-share';
import type { ShareSingleOptions, Social } from 'react-native-share';
import { pickCustomerWhatsApp } from '@/lib/negocios/negocioWhatsApp';

/**
 * Enviar un PDF (contrato o recibo) al cliente.
 *
 * - Android: abre WhatsApp (o WhatsApp Business) directo en el chat del
 *   cliente con el PDF adjunto; el vendedor solo toca Enviar.
 * - iPhone, o Android sin celular válido / sin WhatsApp / con cualquier error:
 *   la hoja de compartir del sistema con el PDF. Enviar nunca se bloquea.
 *
 * El archivo se copia con un nombre claro («Recibo RV-123 - Juan Perez.pdf»)
 * en la caché, que es la carpeta que comparten expo-sharing y react-native-share.
 */

const WHATSAPP_APPS = [
  { packageName: 'com.whatsapp', social: 'WHATSAPP', outcome: 'whatsapp' },
  { packageName: 'com.whatsapp.w4b', social: 'WHATSAPPBUSINESS', outcome: 'whatsapp-business' },
] as const;

/**
 * Se carga al usarlo: una build sin el módulo nativo (p. ej. JS nuevo sobre
 * una build vieja) lanzaría al importar y tumbaría la pantalla; así solo cae a
 * la hoja de compartir.
 */
function loadShare(): typeof RNShare {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-share').default;
}

export type SharePdfOutcome = 'whatsapp' | 'whatsapp-business' | 'share-sheet' | 'unavailable';

export type SharePdfToWhatsAppInput = {
  /** PDF de `Print.printToFileAsync`. */
  uri: string;
  /** Nombre visible del archivo, con o sin «.pdf» (se limpia). */
  fileName: string;
  phone: string | null | undefined;
  phoneSecondary?: string | null;
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

async function shareToWhatsAppChat(uri: string, fileName: string, number: string): Promise<SharePdfOutcome | null> {
  const Share = loadShare();
  for (const app of WHATSAPP_APPS) {
    // Sin la app, shareSingle abriría la Play Store: se pregunta antes.
    const { isInstalled } = await Share.isPackageInstalled(app.packageName);
    if (!isInstalled) continue;
    // `whatsAppNumber` lo lee el código nativo de Android (extra «jid» del
    // chat), aunque los tipos de la librería no lo declaran.
    const options: ShareSingleOptions & { whatsAppNumber: string } = {
      // Valor de la constante nativa («whatsapp» / «whatsappbusiness»).
      social: Share.Social[app.social] as Social.Whatsapp,
      whatsAppNumber: number,
      url: uri,
      type: 'application/pdf',
      filename: fileName.replace(/\.pdf$/i, ''),
    };
    await Share.shareSingle(options);
    return app.outcome;
  }
  return null;
}

export async function sharePdfToWhatsApp(
  input: SharePdfToWhatsAppInput,
  platform: string = Platform.OS
): Promise<SharePdfOutcome> {
  const fileName = sanitizePdfFileName(input.fileName);
  const uri = await namedCopy(input.uri, fileName);
  const target = platform === 'android' ? pickCustomerWhatsApp(input.phone, input.phoneSecondary) : null;
  if (target) {
    try {
      const outcome = await shareToWhatsAppChat(uri, fileName, target.number);
      if (outcome) return outcome;
    } catch {
      // Cualquier falla de WhatsApp termina en la hoja de compartir.
    }
  }
  return shareSheet(uri, input.dialogTitle);
}
