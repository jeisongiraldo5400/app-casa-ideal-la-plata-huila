import { mapWithConcurrency } from '@/lib/catalogos/asyncPool';
import { CATEGORY_CONCURRENCY, SECTION_PAGE_SIZE } from '@/lib/catalogos/constants';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import type { CategoryPreview } from '@/lib/catalogos/sectionCounts';
import { collectSelectionIds } from '@/lib/catalogos/snapshot';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { fetchProfileNames } from '@/lib/profileNames';
import { getPrivateCatalog } from './catalogsService';
import { listAllPublicCatalogProductsInCategory, listPublicCatalogCategoryPreview, listPublicCatalogProductsByIds } from './publicCatalogService';

export type CatalogDetailBundle = {
  detail: PrivateCatalogDetail;
  /** Fichas publicadas de los productos sueltos, por `productId`. */
  products: ReadonlyMap<string, PublicCatalogListingItem>;
  /** Muestra (hasta `SECTION_PAGE_SIZE`) y total de cada categoría completa. */
  categories: ReadonlyMap<string, CategoryPreview>;
  /** Nombre del dueño si no es quien mira. */
  ownerName: string | null;
};

/**
 * Todo lo que pintan Detalle y Compartir en una sola carga. De las
 * categorías completas solo se piden las miniaturas que se muestran y el
 * total; el snapshot pide el resto al generar el enlace, si hace falta.
 */
export async function loadCatalogDetailBundle(id: string, viewerId: string | null): Promise<CatalogDetailBundle | null> {
  const detail = await getPrivateCatalog(id);
  if (!detail) return null;

  const { productIds, categoryIds } = collectSelectionIds(detail.sections);
  const [listing, previews, names] = await Promise.all([
    listPublicCatalogProductsByIds(productIds),
    mapWithConcurrency(
      categoryIds,
      CATEGORY_CONCURRENCY,
      async (categoryId) => [categoryId, await listPublicCatalogCategoryPreview(categoryId, SECTION_PAGE_SIZE)] as const
    ),
    detail.ownerId !== viewerId ? fetchProfileNames([detail.ownerId]) : Promise.resolve(null),
  ]);

  return {
    detail,
    products: new Map(listing.map((item) => [item.productId, item])),
    categories: new Map(previews.map(([categoryId, preview]) => [categoryId, { items: preview.items, totalCount: preview.totalCount }])),
    ownerName: names ? (names.get(detail.ownerId) ?? null) : null,
  };
}

/**
 * Lista entera (solo texto y URL de portada, sin fotos) de varias categorías
 * completas, para «Ver más» en el detalle. Se guardan como muestras
 * completas: el snapshot las reutiliza sin volver a pedirlas.
 */
export async function loadFullCategoryPreviews(categoryIds: readonly string[]): Promise<Map<string, CategoryPreview>> {
  const lists = await mapWithConcurrency(
    [...new Set(categoryIds)],
    CATEGORY_CONCURRENCY,
    async (categoryId) => [categoryId, await listAllPublicCatalogProductsInCategory(categoryId)] as const
  );
  return new Map(lists.map(([categoryId, items]) => [categoryId, { items, totalCount: items.length }]));
}
