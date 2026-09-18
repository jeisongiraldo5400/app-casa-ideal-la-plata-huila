import { mapWithConcurrency } from '@/lib/catalogos/asyncPool';
import { CATEGORY_CONCURRENCY } from '@/lib/catalogos/constants';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import { isCompletePreview, type CategoryPreview } from '@/lib/catalogos/sectionCounts';
import {
  buildListingIndex,
  buildMagazineSnapshot,
  collectSelectedSlugs,
  collectSelectionIds,
  type SnapshotAnalysis,
} from '@/lib/catalogos/snapshot';
import type { MagazineSnapshot, PrivateCatalogDetail } from '@/lib/catalogos/types';
import {
  getPublicCatalogProductDetails,
  listAllPublicCatalogProductsInCategory,
  listPublicCatalogProductsByIds,
  type ProductDetailsProgress,
} from './publicCatalogService';

export type SnapshotProgress = ProductDetailsProgress;

/** Fichas del listado que la pantalla ya tiene cargadas; se reutilizan en vez de volver a pedirlas. */
export type KnownListing = {
  /** Productos sueltos con ficha publicada, por `productId`. */
  products?: ReadonlyMap<string, PublicCatalogListingItem>;
  /** Muestras de categorías completas; solo se reutilizan las que traen todas las fichas. */
  categories?: ReadonlyMap<string, CategoryPreview>;
};

export type AnalyzeSnapshotOptions = {
  known?: KnownListing;
  /** Alimenta el texto «Preparando la edición… n/N». */
  onProgress?: (progress: SnapshotProgress) => void;
};

/**
 * Materializa la edición en el dispositivo con los mismos RPC que el web.
 * Del listado solo se pide lo que falta (productos sueltos no cargados y
 * categorías sin muestra completa); el detalle de cada slug distinto se
 * resuelve siempre, fresco, con `getPublicCatalogProductDetails`.
 */
export async function analyzeCatalogSnapshot(
  detail: PrivateCatalogDetail,
  { known, onProgress }: AnalyzeSnapshotOptions = {}
): Promise<SnapshotAnalysis> {
  const { productIds, categoryIds } = collectSelectionIds(detail.sections);
  const knownProducts = known?.products;
  const knownCategories = known?.categories;

  const missingProductIds = productIds.filter((productId) => !knownProducts?.has(productId));
  const reusedCategories: (readonly [string, PublicCatalogListingItem[]])[] = [];
  const missingCategoryIds: string[] = [];
  for (const categoryId of categoryIds) {
    const preview = knownCategories?.get(categoryId);
    if (isCompletePreview(preview)) reusedCategories.push([categoryId, [...preview.items]]);
    else missingCategoryIds.push(categoryId);
  }

  const [fetchedProducts, fetchedCategories] = await Promise.all([
    listPublicCatalogProductsByIds(missingProductIds),
    mapWithConcurrency(
      missingCategoryIds,
      CATEGORY_CONCURRENCY,
      async (categoryId) => [categoryId, await listAllPublicCatalogProductsInCategory(categoryId)] as const
    ),
  ]);

  const reusedProducts = productIds.flatMap((productId) => {
    const product = knownProducts?.get(productId);
    return product ? [product] : [];
  });
  const index = buildListingIndex([...reusedProducts, ...fetchedProducts], [...reusedCategories, ...fetchedCategories]);
  const slugs = collectSelectedSlugs(detail.sections, index);
  const detailBySlug = await getPublicCatalogProductDetails(slugs, onProgress);

  return buildMagazineSnapshot({
    catalog: detail,
    sections: detail.sections,
    index,
    detailBySlug,
    publishedAt: new Date().toISOString(),
  });
}

/** Snapshot listo para congelar. Lanza con los motivos si aún no se puede publicar. */
export async function buildCatalogSnapshot(detail: PrivateCatalogDetail, options: AnalyzeSnapshotOptions = {}): Promise<MagazineSnapshot> {
  const { snapshot, blockers } = await analyzeCatalogSnapshot(detail, options);
  if (blockers.length > 0) throw new Error(blockers.join(' '));
  return snapshot;
}
