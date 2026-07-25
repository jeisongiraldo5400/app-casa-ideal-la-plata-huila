import { supabase } from '@/lib/supabase';

const BUCKET = 'negocios-firmas';

/**
 * Sube firma (data URL) a Storage y devuelve URL pública.
 * Si ya es http(s), la reutiliza.
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

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  if (!raw.startsWith('data:image/')) {
    throw new Error('Formato de firma no válido');
  }

  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('No se pudo leer la firma');
  }

  const mime = match[1];
  const base64 = match[2];
  const ext =
    mime.includes('svg')
      ? 'svg'
      : mime.includes('jpeg') || mime.includes('jpg')
        ? 'jpg'
        : mime.includes('webp')
          ? 'webp'
          : 'png';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const path = `${opts.negocioId}/${opts.role}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: mime,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Error al subir firma (${opts.role}): ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
