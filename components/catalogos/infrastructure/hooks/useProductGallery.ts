import { useEffect, useState } from 'react';
import { productGalleryUrls } from '@/lib/catalogos/gallery';
import { getPublicCatalogProductDetails } from '../services/publicCatalogService';

/** Lo que se quiere ver en grande: una ficha (con slug) o solo una imagen (portada de la edición). */
export type ImagePreviewTarget = {
  title: string;
  coverUrl: string | null;
  /** Con slug se piden las demás fotos de la ficha; sin él solo se ve `coverUrl`. */
  slug?: string | null;
};

// Fotos ya resueltas por slug durante la sesión: volver a abrir la misma
// ficha no repite la consulta. Solo guarda URLs (texto), nunca imágenes.
const gallerySession = new Map<string, string[]>();

/**
 * URLs de la galería de una ficha. Arranca con la portada que ya tenía la
 * fila (se ve al instante y sirve sin señal) y, si la ficha tiene más fotos,
 * las añade tras UNA consulta al abrir la vista ampliada. Un fallo (sin
 * señal) deja la portada sola, sin error.
 */
export function useProductGallery(target: ImagePreviewTarget | null): { urls: string[]; loading: boolean } {
  const slug = target?.slug ?? null;
  const coverUrl = target?.coverUrl ?? null;
  const [resolved, setResolved] = useState<{ slug: string; urls: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug || gallerySession.has(slug)) return;
    let cancelled = false;
    setLoading(true);
    getPublicCatalogProductDetails([slug])
      .then((details) => {
        const urls = productGalleryUrls(details.get(slug)?.media, null);
        gallerySession.set(slug, urls);
        if (!cancelled) setResolved({ slug, urls });
      })
      .catch(() => {
        // Sin señal o ficha retirada: se queda la portada.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!target) return { urls: [], loading: false };
  const fetched = slug ? (gallerySession.get(slug) ?? (resolved?.slug === slug ? resolved.urls : null)) : null;
  const urls = fetched && fetched.length > 0 ? fetched : coverUrl ? [coverUrl] : [];
  return { urls, loading: loading && !fetched };
}
