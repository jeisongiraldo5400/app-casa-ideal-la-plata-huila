/**
 * Fotos opcionales del cliente al crear un negocio (migración 20261231370000):
 * una foto de la persona y de su cédula por el frente y por atrás
 * (`customer_id_back_photo_path`), en el bucket privado
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
export type NegocioPhotoKind = 'cliente' | 'cedula' | 'cedula_atras';

/** Orden fijo en el asistente, en `p_negocio` y en el detalle. */
export const NEGOCIO_PHOTO_KINDS: readonly NegocioPhotoKind[] = ['cliente', 'cedula', 'cedula_atras'];

/** Rol con el que viaja en la cola sin señal (junto a los de las firmas). */
export type NegocioPhotoRole = 'foto_cliente' | 'foto_cedula' | 'foto_cedula_atras';

export const NEGOCIO_PHOTO_ROLE: Record<NegocioPhotoKind, NegocioPhotoRole> = {
  cliente: 'foto_cliente',
  cedula: 'foto_cedula',
  cedula_atras: 'foto_cedula_atras',
};

/** Clave de `p_negocio` para cada foto. `customer_id_photo_path` es el frente. */
export type NegocioPhotoField = 'customer_photo_path' | 'customer_id_photo_path' | 'customer_id_back_photo_path';

export const NEGOCIO_PHOTO_FIELD: Record<NegocioPhotoKind, NegocioPhotoField> = {
  cliente: 'customer_photo_path',
  cedula: 'customer_id_photo_path',
  cedula_atras: 'customer_id_back_photo_path',
};

export const NEGOCIO_PHOTO_LABEL: Record<NegocioPhotoKind, string> = {
  cliente: 'Foto del cliente',
  cedula: 'Cédula (frente)',
  cedula_atras: 'Cédula (atrás)',
};

/** «la foto del cliente», «la foto de la cédula (frente)»… para los mensajes. */
export const NEGOCIO_PHOTO_NOUN: Record<NegocioPhotoKind, string> = {
  cliente: 'la foto del cliente',
  cedula: 'la foto de la cédula (frente)',
  cedula_atras: 'la foto de la cédula (atrás)',
};

/** Tipo de foto a partir de su rol en la cola (null si es una firma). */
export function negocioPhotoKindForRole(role: string | null | undefined): NegocioPhotoKind | null {
  return NEGOCIO_PHOTO_KINDS.find((kind) => NEGOCIO_PHOTO_ROLE[kind] === role) ?? null;
}

/** Tipo de foto a partir de su clave en `p_negocio`. */
export function negocioPhotoKindForField(field: string | null | undefined): NegocioPhotoKind | null {
  return NEGOCIO_PHOTO_KINDS.find((kind) => NEGOCIO_PHOTO_FIELD[kind] === field) ?? null;
}

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

/** Fotos presentes del borrador, en orden fijo (cliente, cédula frente, cédula atrás). */
export function negocioPhotoEntries(photos: Partial<Record<NegocioPhotoKind, NegocioPhotoDraft | null>>) {
  return NEGOCIO_PHOTO_KINDS
    .map((kind) => ({ kind, photo: photos[kind] ?? null }))
    .filter((entry): entry is { kind: NegocioPhotoKind; photo: NegocioPhotoDraft } => Boolean(entry.photo));
}

/**
 * Campos de `p_negocio` para las fotos. Sin fotos no se añade nada: el
 * negocio sale con la misma forma de siempre.
 */
export function negocioPhotoFields(paths: Partial<Record<NegocioPhotoKind, string | null>>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const kind of NEGOCIO_PHOTO_KINDS) {
    const path = paths[kind];
    if (path) fields[NEGOCIO_PHOTO_FIELD[kind]] = path;
  }
  return fields;
}

/** Falló la subida de una foto: el negocio no se creó. */
export class NegocioPhotoUploadError extends Error {
  /** Reintentar no lo arregla (archivo ilegible, tipo/tamaño o permiso rechazado). */
  readonly definitive: boolean;
  readonly detail: string;
  constructor(kind: NegocioPhotoKind | null, detail: string, options: { definitive?: boolean } = {}) {
    super(`No se pudo subir ${NEGOCIO_PHOTO_NOUN[kind ?? 'cliente']}: ${detail}`);
    this.name = 'NegocioPhotoUploadError';
    this.definitive = Boolean(options.definitive);
    this.detail = detail;
  }
}

/**
 * Error de Storage que no cambiará al reintentar: 4xx salvo 408 (tiempo) y
 * 429 (demasiadas peticiones). Sin código no se da por definitivo.
 */
function isDefinitiveStorageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { statusCode?: unknown; status?: unknown };
  const status = Number(record.statusCode ?? record.status);
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
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
  if (!response.ok) {
    throw new NegocioPhotoUploadError(kind, 'no se pudo leer la foto en el teléfono', { definitive: true });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > NEGOCIO_PHOTO_MAX_BYTES) {
    throw new NegocioPhotoUploadError(kind, 'supera 5 MB', { definitive: true });
  }

  const { error } = await supabase.storage.from(NEGOCIO_PHOTO_BUCKET).upload(opts.path, bytes, {
    contentType: negocioPhotoContentType(opts.mimeType),
    upsert: false,
    cacheControl: '3600',
  });
  if (error && !isAlreadyUploadedError(error)) {
    throw new NegocioPhotoUploadError(kind, error.message || 'error desconocido', {
      definitive: isDefinitiveStorageError(error),
    });
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

/**
 * Intenta limpiar fotos huérfanas (el negocio no se creó). El bucket no tiene
 * política de borrado, así que normalmente no hace nada: nunca lanza ni avisa.
 */
export async function removeNegocioPhotos(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((path): path is string => Boolean(path));
  if (!list.length) return;
  try {
    await supabase.storage.from(NEGOCIO_PHOTO_BUCKET).remove(list);
  } catch {
    // Best effort: una foto huérfana en la carpeta del usuario no hace daño.
  }
}
