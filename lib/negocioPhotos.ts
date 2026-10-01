/**
 * Fotos opcionales del cliente al crear un negocio (migración 20261231370000):
 * una foto de la persona y una de su cédula, en el bucket privado
 * `negocios-fotos`, bajo la carpeta del usuario que crea el negocio
 * (`<auth.uid()>/<uuid>.<ext>`), igual que las firmas en `negocios-firmas`:
 * un negocio creado sin señal aún no tiene id en el servidor.
 *
 * La ruta se decide al TOMAR la foto (el uuid nace con ella), no al subirla:
 * un reintento envía la misma ruta en `p_negocio` (la huella de idempotencia
 * no cambia) y la foto ya subida no se vuelve a subir.
 */
import { supabase } from '@/lib/supabase';

export const NEGOCIO_PHOTO_BUCKET = 'negocios-fotos';
export const NEGOCIO_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Qué muestra la foto. */
export type NegocioPhotoKind = 'cliente' | 'cedula';

/** Rol con el que viaja en la cola sin señal (junto a los de las firmas). */
export type NegocioPhotoRole = 'foto_cliente' | 'foto_cedula';

export const NEGOCIO_PHOTO_ROLE: Record<NegocioPhotoKind, NegocioPhotoRole> = {
  cliente: 'foto_cliente',
  cedula: 'foto_cedula',
};

/** Clave de `p_negocio` para cada foto. */
export const NEGOCIO_PHOTO_FIELD: Record<NegocioPhotoKind, 'customer_photo_path' | 'customer_id_photo_path'> = {
  cliente: 'customer_photo_path',
  cedula: 'customer_id_photo_path',
};

export const NEGOCIO_PHOTO_LABEL: Record<NegocioPhotoKind, string> = {
  cliente: 'Foto del cliente',
  cedula: 'Foto de la cédula',
};

/** Foto elegida en el teléfono, aún en el asistente. */
export type NegocioPhotoDraft = {
  /** uuid del archivo: fija la ruta en Storage. */
  id: string;
  uri: string;
  mimeType: string;
  size: number | null;
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function negocioPhotoExtension(mimeType: string): string | null {
  return EXTENSIONS[(mimeType || '').toLowerCase()] ?? null;
}

export function negocioPhotoContentType(mimeType: string): string {
  const mime = (mimeType || '').toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

export function validateNegocioPhoto(photo: Pick<NegocioPhotoDraft, 'mimeType' | 'size'>): string | null {
  if (!negocioPhotoExtension(photo.mimeType)) return 'Solo se permiten fotos JPG, PNG o WebP.';
  if (photo.size != null && photo.size > NEGOCIO_PHOTO_MAX_BYTES) return 'La foto no puede superar 5 MB.';
  return null;
}

/** Ruta en el bucket: siempre dentro de la carpeta del usuario (el servidor lo exige). */
export function negocioPhotoPath(userId: string, photo: Pick<NegocioPhotoDraft, 'id' | 'mimeType'>): string {
  const ext = negocioPhotoExtension(photo.mimeType);
  if (!userId || !photo.id || !ext) throw new Error('La foto del cliente no es válida');
  return `${userId}/${photo.id}.${ext}`;
}

/** Fotos presentes del borrador, en orden fijo (cliente, cédula). */
export function negocioPhotoEntries(photos: Partial<Record<NegocioPhotoKind, NegocioPhotoDraft | null>>) {
  return (['cliente', 'cedula'] as const)
    .map((kind) => ({ kind, photo: photos[kind] ?? null }))
    .filter((entry): entry is { kind: NegocioPhotoKind; photo: NegocioPhotoDraft } => Boolean(entry.photo));
}

/**
 * Campos de `p_negocio` para las fotos. Sin fotos no se añade nada: el
 * negocio sale con la misma forma de siempre.
 */
export function negocioPhotoFields(paths: Partial<Record<NegocioPhotoKind, string | null>>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const kind of ['cliente', 'cedula'] as const) {
    const path = paths[kind];
    if (path) fields[NEGOCIO_PHOTO_FIELD[kind]] = path;
  }
  return fields;
}

/** Falló la subida de una foto: el negocio no se creó. */
export class NegocioPhotoUploadError extends Error {
  constructor(kind: NegocioPhotoKind | null, detail: string) {
    super(`No se pudo subir la ${kind === 'cedula' ? 'foto de la cédula' : 'foto del cliente'}: ${detail}`);
    this.name = 'NegocioPhotoUploadError';
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

/**
 * Sube el archivo local a la ruta ya decidida. Sin `upsert` (el bucket no deja
 * editar): si un intento anterior ya lo dejó arriba, «ya existe» cuenta como
 * subido. Un fallo de red se relanza tal cual para que quien llama pueda
 * encolar el negocio sin señal.
 */
export async function uploadNegocioPhoto(
  localUri: string,
  opts: { path: string; mimeType: string; kind?: NegocioPhotoKind | null }
): Promise<string> {
  const kind = opts.kind ?? null;
  const response = await fetch(localUri);
  if (!response.ok) throw new NegocioPhotoUploadError(kind, 'no se pudo leer la foto en el teléfono');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > NEGOCIO_PHOTO_MAX_BYTES) throw new NegocioPhotoUploadError(kind, 'supera 5 MB');

  const { error } = await supabase.storage.from(NEGOCIO_PHOTO_BUCKET).upload(opts.path, bytes, {
    contentType: negocioPhotoContentType(opts.mimeType),
    upsert: false,
    cacheControl: '3600',
  });
  if (error && !isAlreadyUploadedError(error)) {
    throw new NegocioPhotoUploadError(kind, error.message || 'error desconocido');
  }
  return opts.path;
}

export async function getNegocioPhotoSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(NEGOCIO_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'No se pudo abrir la foto');
  return data.signedUrl;
}

/** Limpia fotos huérfanas (el negocio no se creó). Best effort. */
export async function removeNegocioPhotos(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((path): path is string => Boolean(path));
  if (!list.length) return;
  const { error } = await supabase.storage.from(NEGOCIO_PHOTO_BUCKET).remove(list);
  if (error) throw new Error(`No se pudieron limpiar las fotos: ${error.message}`);
}
