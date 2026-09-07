// URL pública de un objeto de Storage. Solo sirve para buckets de lectura
// pública (`catalog-images`, `catalog-videos`); el móvil nunca sube archivos,
// solo muestra los que ya subió el panel web.

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function supabaseBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Falta configurar EXPO_PUBLIC_SUPABASE_URL.');
  return url.replace(/\/+$/, '');
}

export function buildPublicStorageUrl(bucket: string, storagePath: string): string {
  return `${supabaseBaseUrl()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;
}
