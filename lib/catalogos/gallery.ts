import type { PublicCatalogMediaItem } from './publicCatalogTypes';

/**
 * Fotos de una ficha para la vista ampliada del móvil: solo imágenes con URL
 * pública (bucket `catalog-images`), la portada primero y luego por orden. Si
 * la ficha no trae ninguna (o no se pudo cargar), queda la portada que ya
 * mostraba la lista. Nunca repite una URL.
 */
export function productGalleryUrls(
  media: readonly PublicCatalogMediaItem[] | null | undefined,
  fallbackCoverUrl: string | null | undefined
): string[] {
  const images = (media ?? [])
    .filter((item) => item.type === 'IMAGE' && Boolean(item.publicUrl))
    .slice()
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
  const urls: string[] = [];
  for (const item of images) {
    if (item.publicUrl && !urls.includes(item.publicUrl)) urls.push(item.publicUrl);
  }
  if (urls.length === 0 && fallbackCoverUrl) urls.push(fallbackCoverUrl);
  return urls;
}
