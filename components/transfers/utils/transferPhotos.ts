/**
 * Fotos opcionales de traslados (migración 20261231350000), reglas puras.
 *
 * La ruta se decide al TOMAR la foto (`<traslado>/<uuid>.<ext>`), no al
 * subirla: así un reintento tras una caída de red envía la misma ruta (la
 * huella de idempotencia no cambia) y la foto ya subida no se vuelve a subir.
 */
import type { TransferEvent } from './transferModel';

export const TRANSFER_PHOTO_BUCKET = 'transfer-photos';
export const TRANSFER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Foto elegida en el teléfono (vive en el borrador en memoria). */
export type TransferPhotoDraft = {
  /** uuid del archivo dentro de la carpeta del traslado. */
  id: string;
  uri: string;
  mimeType: string;
  size: number | null;
  /** Ya quedó en Storage: un reintento no la vuelve a subir. */
  uploaded: boolean;
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Extensión permitida por el bucket o `null` (p. ej. HEIC). */
export function transferPhotoExtension(mimeType: string): string | null {
  return EXTENSIONS[(mimeType || '').toLowerCase()] ?? null;
}

/** Tipo MIME normalizado que se declara al subir. */
export function transferPhotoContentType(mimeType: string): string {
  const mime = (mimeType || '').toLowerCase();
  return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

export function validateTransferPhoto(photo: Pick<TransferPhotoDraft, 'mimeType' | 'size'>): string | null {
  if (!transferPhotoExtension(photo.mimeType)) return 'Solo se permiten fotos JPG, PNG o WebP.';
  if (photo.size != null && photo.size > TRANSFER_PHOTO_MAX_BYTES) return 'La foto no puede superar 5 MB.';
  return null;
}

/** Ruta en el bucket: siempre dentro de la carpeta del traslado (el servidor lo exige). */
export function transferPhotoPath(transferOrderId: string, photo: Pick<TransferPhotoDraft, 'id' | 'mimeType'>): string {
  const ext = transferPhotoExtension(photo.mimeType);
  if (!transferOrderId || !photo.id || !ext) throw new Error('La foto no es válida para este traslado');
  return `${transferOrderId}/${photo.id}.${ext}`;
}

export const optionalPhotoPath = (transferOrderId: string, photo: TransferPhotoDraft | null | undefined): string | null =>
  photo ? transferPhotoPath(transferOrderId, photo) : null;

/** Pone `photo_path` en los elementos «averiada» de las líneas que tienen foto de avería. */
export function withDamagedPhotoPaths<T extends { item_id: string; condition: 'ok' | 'damaged' }>(
  items: T[],
  pathsByItem: Record<string, string>
): (T & { photo_path?: string })[] {
  return items.map((item) => {
    const path = item.condition === 'damaged' ? pathsByItem[item.item_id] : undefined;
    return path ? { ...item, photo_path: path } : item;
  });
}

// ---------------------------------------------------------------------------
// Fotos del historial del traslado
// ---------------------------------------------------------------------------

export type TransferEventPhoto = { path: string; label: string; createdAt: string | null; userName: string | null };

const ACTION_LABEL: Record<string, string> = {
  dispatch: 'Despacho',
  receive: 'Recepción',
  return_to_origin: 'Devolución',
  return_requested: 'Devolución',
  write_off: 'Baja',
};

/**
 * Una miniatura por archivo: la foto general de un despacho o recepción se
 * repite en el evento de cada línea, así que se agrupa por ruta. Si la ruta
 * solo aparece en una línea, se nombra el producto (p. ej. la foto de avería).
 */
export function eventPhotos(events: TransferEvent[]): TransferEventPhoto[] {
  const byPath = new Map<string, TransferEvent[]>();
  for (const event of events) {
    if (!event.photoPath) continue;
    const list = byPath.get(event.photoPath);
    if (list) list.push(event);
    else byPath.set(event.photoPath, [event]);
  }
  return [...byPath.entries()].map(([path, list]) => {
    const first = list[0];
    const action = ACTION_LABEL[first.eventType] ?? 'Traslado';
    const single = list.length === 1 && first.productName;
    const label = single
      ? `${action} · ${first.productName}${first.condition === 'damaged' ? ' (averiada)' : ''}`
      : action;
    return { path, label, createdAt: first.createdAt, userName: first.userName };
  });
}
