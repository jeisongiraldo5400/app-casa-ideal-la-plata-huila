import { mapWithConcurrency } from '@/lib/catalogos/asyncPool';
import { CATEGORY_CONCURRENCY, DETAIL_CONCURRENCY } from '@/lib/catalogos/constants';
import type { PublicCatalogListingItem, PublicCatalogProductDetail } from '@/lib/catalogos/publicCatalogTypes';
import {
  buildListingIndex,
  buildMagazineSnapshot,
  collectSelectedSlugs,
  collectSelectionIds,
  type SnapshotAnalysis,
} from '@/lib/catalogos/snapshot';
import type { MagazineSnapshot, PrivateCatalogDetail } from '@/lib/catalogos/types';
import {
  getPublicCatalogProductBySlug,
  listAllPublicCatalogProductsInCategory,
  listPublicCatalogProductsByIds,
} from './publicCatalogService';

export type SnapshotProgress = { resolved: number; total: number };

/**
 * Materializa la edición en el dispositivo con los mismos RPC que el web:
 * productos sueltos por id (una llamada), categorías paginadas, y luego la
 * ficha completa de cada slug distinto. `onProgress` alimenta el texto
 * «Preparando la edición… n/N».
 */
export async function analyzeCatalogSnapshot(
  detail: PrivateCatalogDetail,
  onProgress?: (progress: SnapshotProgress) => void
): Promise<SnapshotAnalysis> {
  const { productIds, categoryIds } = collectSelectionIds(detail.sections);

  const [products, categories] = await Promise.all([
    listPublicCatalogProductsByIds(productIds),
    mapWithConcurrency(
      categoryIds,
      CATEGORY_CONCURRENCY,
      async (categoryId) => [categoryId, await listAllPublicCatalogProductsInCategory(categoryId)] as const
    ),
  ]);

  const index = buildListingIndex(
    products as PublicCatalogListingItem[],
    categories as readonly (readonly [string, PublicCatalogListingItem[]])[]
  );
  const slugs = collectSelectedSlugs(detail.sections, index);

  let resolved = 0;
  onProgress?.({ resolved, total: slugs.length });
  const details = await mapWithConcurrency(slugs, DETAIL_CONCURRENCY, async (slug) => {
    const productDetail = await getPublicCatalogProductBySlug(slug);
    resolved += 1;
    onProgress?.({ resolved, total: slugs.length });
    return [slug, productDetail] as const;
  });

  const detailBySlug = new Map<string, PublicCatalogProductDetail>();
  for (const [slug, productDetail] of details) {
    if (productDetail) detailBySlug.set(slug, productDetail);
  }

  return buildMagazineSnapshot({
    catalog: detail,
    sections: detail.sections,
    index,
    detailBySlug,
    publishedAt: new Date().toISOString(),
  });
}

/** Snapshot listo para congelar. Lanza con los motivos si aún no se puede publicar. */
export async function buildCatalogSnapshot(
  detail: PrivateCatalogDetail,
  onProgress?: (progress: SnapshotProgress) => void
): Promise<MagazineSnapshot> {
  const { snapshot, blockers } = await analyzeCatalogSnapshot(detail, onProgress);
  if (blockers.length > 0) throw new Error(blockers.join(' '));
  return snapshot;
}
