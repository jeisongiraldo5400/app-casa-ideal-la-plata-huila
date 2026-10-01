/**
 * Storage de las fotos de traslados (bucket privado `transfer-photos`,
 * migración 20261231350000). Sube y lee quien puede ver el traslado; nadie
 * edita ni borra desde el cliente, por eso se sube sin `upsert`.
 */
import { supabase } from '@/lib/supabase';
import {
  TRANSFER_PHOTO_BUCKET,
  TRANSFER_PHOTO_MAX_BYTES,
  transferPhotoContentType,
  transferPhotoPath,
  validateTransferPhoto,
  type TransferPhotoDraft,
} from '../../utils/transferPhotos';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Falló la subida de una foto: no se llamó a la RPC. */
export class TransferPhotoUploadError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'TransferPhotoUploadError';
  }
}

/** ¿El archivo ya existe? (la subida anterior llegó pero se perdió la respuesta). */
function isAlreadyUploadedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  return (
    String(record.statusCode ?? '') === '409' ||
    String(record.status ?? '') === '409' ||
    /already exists|duplicate/i.test(String(record.message ?? ''))
  );
}

async function readPhotoBytes(uri: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(uri);
  } catch {
    throw new TransferPhotoUploadError('No se pudo leer la foto en el teléfono');
  }
  if (!response.ok) throw new TransferPhotoUploadError('No se pudo leer la foto en el teléfono');
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Sube la foto (si aún no subió) a `<traslado>/<uuid>.<ext>` y devuelve la
 * ruta. Lanza `TransferPhotoUploadError` si no se pudo.
 */
export async function uploadTransferPhoto(transferOrderId: string, photo: TransferPhotoDraft): Promise<string> {
  const path = transferPhotoPath(transferOrderId, photo);
  if (photo.uploaded) return path;
  const invalid = validateTransferPhoto(photo);
  if (invalid) throw new TransferPhotoUploadError(invalid);

  const bytes = await readPhotoBytes(photo.uri);
  if (bytes.byteLength > TRANSFER_PHOTO_MAX_BYTES) throw new TransferPhotoUploadError('La foto no puede superar 5 MB');

  const { error } = await supabase.storage.from(TRANSFER_PHOTO_BUCKET).upload(path, bytes, {
    contentType: transferPhotoContentType(photo.mimeType),
    upsert: false,
    cacheControl: '3600',
  });
  if (error && !isAlreadyUploadedError(error)) {
    throw new TransferPhotoUploadError(error.message || 'Error desconocido');
  }
  return path;
}

export async function getTransferPhotoSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(TRANSFER_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'No se pudo abrir la foto');
  return data.signedUrl;
}

/**
 * Sube en orden las fotos que falten y avisa cada una que quedó arriba (para
 * marcarla en el borrador: el reintento ya no la sube). Si una falla, se
 * detiene y lanza: lo ya subido queda marcado.
 */
export async function uploadPendingTransferPhotos(
  transferOrderId: string,
  photos: TransferPhotoDraft[],
  onUploaded: (photo: TransferPhotoDraft) => void
): Promise<void> {
  for (const photo of photos) {
    if (photo.uploaded) continue;
    await uploadTransferPhoto(transferOrderId, photo);
    onUploaded({ ...photo, uploaded: true });
  }
}
