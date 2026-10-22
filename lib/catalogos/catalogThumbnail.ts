import { isGlobalCatalog } from './catalogListFilters';
import type { PrivateCatalogListItem } from './types';

/**
 * Miniatura de un catálogo en la lista (pedido del usuario, 2026-10-22): la
 * portada propia si la tiene; si no, la foto principal del primer producto,
 * para que se sepa qué contiene y no solo el nombre. `null` deja el ícono.
 */
export function catalogThumbnailUrl(item: Pick<PrivateCatalogListItem, 'coverImageUrl' | 'firstProductImageUrl'>): string | null {
  return item.coverImageUrl?.trim() || item.firstProductImageUrl?.trim() || null;
}

/**
 * ¿Hace falta pedir la foto del primer producto? Solo para lo que el móvil
 * muestra (lo propio y lo global publicado) y no tiene portada: lo privado
 * ajeno que la RLS le trae al administrador no se dibuja.
 */
export function needsProductThumbnail(
  catalog: Pick<PrivateCatalogListItem, 'coverImageUrl' | 'isOwner' | 'visibility' | 'status'>
): boolean {
  if (catalog.coverImageUrl?.trim()) return false;
  return catalog.isOwner || isGlobalCatalog(catalog);
}
