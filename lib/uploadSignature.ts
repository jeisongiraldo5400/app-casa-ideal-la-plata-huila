import { supabase } from '@/lib/supabase';
import { createIdempotencyKey } from '@/lib/idempotency';
import { validateTransparentPng } from '@/lib/signaturePng';

const BUCKET = 'negocios-firmas';
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function isSafeSignaturePath(path: string): boolean {
  return Boolean(path) &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function extractNegocioSignaturePath(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.startsWith('data:')) return null;
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return isSafeSignaturePath(raw) ? raw : null;
  }
  if (/%(?:2e|2f|5c)/i.test(raw)) return null;
  const remote = new URL(raw);
  const expectedOrigin = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!).origin;
  if (remote.origin !== expectedOrigin) return null;
  const markers = [
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/${BUCKET}/`,
  ];
  const marker = markers.find((candidate) => remote.pathname.includes(candidate));
  if (!marker) return null;
  try {
    const path = decodeURIComponent(remote.pathname.split(marker)[1] || '');
    return isSafeSignaturePath(path) ? path : null;
  } catch {
    return null;
  }
}

export async function resolveNegocioSignatureUrl(
  storedValue: string | null | undefined
): Promise<string | null> {
  if (!storedValue) return null;
  const path = extractNegocioSignaturePath(storedValue);
  if (!path) throw new Error('La ruta de la firma no es válida');
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`No se pudo autorizar la firma: ${error.message}`);
  return data.signedUrl;
}

export async function removeNegocioSignatures(
  storedValues: Array<string | null | undefined>
): Promise<void> {
  const paths = storedValues
    .map((value) => (value ? extractNegocioSignaturePath(value) : null))
    .filter((value): value is string => Boolean(value));
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`No se pudieron limpiar las firmas: ${error.message}`);
}

/** Firma recién capturada en el dispositivo (aún no subida a Storage). */
export function isNewLocalSignature(value: string | null | undefined): boolean {
  return Boolean(
    value?.startsWith('data:image/') || value?.startsWith('file:') || value?.startsWith('content:')
  );
}

/**
 * Sube firma a Storage privado y devuelve su ruta persistente.
 */
export async function uploadNegocioSignature(
  dataUrlOrRemote: string | null | undefined,
  opts: {
    negocioId: string;
    role: 'cliente' | 'fiador' | 'vendedor';
  }
): Promise<string | null> {
  const raw = dataUrlOrRemote?.trim();
  if (!raw) return null;

  const isLocalPng = raw.startsWith('file:') || raw.startsWith('content:');
  if (!raw.startsWith('data:image/') && !isLocalPng) {
    const existingPath = extractNegocioSignaturePath(raw);
    if (existingPath) return existingPath;
    throw new Error('La firma remota no pertenece al almacenamiento autorizado');
  }

  let mime: string;
  let bytes: Uint8Array;
  if (isLocalPng) {
    const response = await fetch(raw);
    if (!response.ok) throw new Error('No se pudo leer la firma seleccionada');
    mime = 'image/png';
    bytes = new Uint8Array(await response.arrayBuffer());
    const validationError = validateTransparentPng(bytes);
    if (validationError) throw new Error(validationError);
  } else {
    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('No se pudo leer la firma');
    mime = match[1];
    if (!ALLOWED_MIME_TYPES.has(mime)) throw new Error('Tipo de imagen de firma no permitido');
    const binary = atob(match[2]);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }
  const ext =
    mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Sesión no válida para subir la firma');
  const path = `${user.id}/${opts.negocioId}/${opts.role}-${createIdempotencyKey()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Error al subir firma (${opts.role}): ${uploadError.message}`);
  }

  return path;
}
