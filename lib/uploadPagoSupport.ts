import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';

export const PAGO_SUPPORT_BUCKET = 'negocio-pagos-soportes';
export const PAGO_SUPPORT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

export type PagoSupportLocalFile = {
  uri: string;
  mimeType: string;
  name: string;
  size?: number | null;
};

function extensionForMime(mime: string) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  throw new Error('Tipo de soporte no permitido');
}

export function validatePagoSupportLocalFile(file: PagoSupportLocalFile): string | null {
  const mime = (file.mimeType || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return 'Solo se permiten imágenes JPG/PNG/WebP o PDF';
  }
  if (file.size != null && file.size > PAGO_SUPPORT_MAX_BYTES) {
    return 'El soporte no puede superar 5 MB';
  }
  return null;
}

export function buildPagoSupportPath(negocioId: string, pagoId: string, mime: string) {
  return `${negocioId}/${pagoId}.${extensionForMime(mime)}`;
}

async function readUriAsUint8Array(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('No se pudo leer el archivo de soporte');
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function uploadPagoSupportFile(options: {
  negocioId: string;
  pagoId: string;
  file: PagoSupportLocalFile;
}): Promise<{ path: string; mime: string; fileName: string }> {
  const validationError = validatePagoSupportLocalFile(options.file);
  if (validationError) throw new Error(validationError);

  const mime = options.file.mimeType.toLowerCase();
  const path = buildPagoSupportPath(options.negocioId, options.pagoId, mime);
  const bytes = await readUriAsUint8Array(options.file.uri);

  if (bytes.byteLength > PAGO_SUPPORT_MAX_BYTES) {
    throw new Error('El soporte no puede superar 5 MB');
  }

  const { error } = await supabase.storage.from(PAGO_SUPPORT_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: '3600',
  });

  if (error) {
    throw new Error(`Error al subir el soporte: ${error.message}`);
  }

  return {
    path,
    mime,
    fileName: options.file.name || `soporte.${extensionForMime(mime)}`,
  };
}

export async function attachPagoSupport(options: {
  pagoId: string;
  path: string;
  mime: string;
  fileName?: string | null;
}) {
  const { error } = await supabase.rpc('attach_negocio_pago_support', {
    p_pago_id: options.pagoId,
    p_path: options.path,
    p_mime: options.mime,
    p_file_name: options.fileName || null,
  });
  if (error) {
    throw new Error(error.message || 'No se pudo adjuntar el soporte');
  }
}

export async function uploadAndAttachPagoSupport(options: {
  negocioId: string;
  pagoId: string;
  file: PagoSupportLocalFile;
}) {
  const uploaded = await uploadPagoSupportFile(options);
  await attachPagoSupport({
    pagoId: options.pagoId,
    path: uploaded.path,
    mime: uploaded.mime,
    fileName: uploaded.fileName,
  });
  return uploaded;
}

export async function getPagoSupportSignedUrl(path: string, expiresInSeconds = 180) {
  const { data, error } = await supabase.storage
    .from(PAGO_SUPPORT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'No se pudo abrir el soporte');
  }
  return data.signedUrl;
}

export async function openPagoSupport(path: string) {
  const url = await getPagoSupportSignedUrl(path);
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error('No se pudo abrir el soporte en este dispositivo');
  }
  await Linking.openURL(url);
}
