import { supabase } from '@/lib/supabase';
import { mapWithConcurrency } from '@/lib/catalogos/asyncPool';
import { CATEGORY_PAGE_SIZE, DETAIL_CONCURRENCY, MAX_CATEGORY_PAGES, PICKER_PAGE_SIZE } from '@/lib/catalogos/constants';
import {
  mapPublicCatalogCategoryRow,
  mapPublicCatalogListingRow,
  mapPublicCatalogProductDetail,
  type PublicCatalogCategoryRow,
  type PublicCatalogListingRow,
  type PublicCatalogProductDetailRaw,
} from '@/lib/catalogos/publicCatalogMappers';
import type {
  PublicCatalogCategory,
  PublicCatalogListingItem,
  PublicCatalogListingResult,
  PublicCatalogProductDetail,
} from '@/lib/catalogos/publicCatalogTypes';

// Fichas publicadas de la biblioteca. Los RPC son SECURITY DEFINER y solo
// exponen fichas `published` sobre productos activos; nunca sku. Las
// existencias solo sirven para marcar «Agotado»: la cantidad no se muestra.

export type ListPublicCatalogProductsParams = {
  search?: string;
  categoryId?: string | null;
  /** 1-based, como el RPC. */
  page?: number;
  pageSize?: number;
};

export async function listPublicCatalogProducts({
  search = '',
  categoryId = null,
  page = 1,
  pageSize = PICKER_PAGE_SIZE,
}: ListPublicCatalogProductsParams = {}): Promise<PublicCatalogListingResult> {
  const { data, error } = await supabase.rpc('get_public_catalog_listing', {
    search,
    p_category_id: categoryId,
    page,
    page_size: pageSize,
  });
  if (error) throw new Error(`No fue posible cargar las fichas: ${error.message}`);
  const rows = (data ?? []) as PublicCatalogListingRow[];
  return { items: rows.map(mapPublicCatalogListingRow), totalCount: Number(rows[0]?.total_count ?? 0) };
}

/** Fichas publicadas por `productId`, en una sola consulta y sin paginar. */
export async function listPublicCatalogProductsByIds(productIds: readonly string[]): Promise<PublicCatalogListingItem[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_public_catalog_products_by_ids', { p_product_ids: [...productIds] });
  if (error) throw new Error(`No fue posible cargar los productos de la edición: ${error.message}`);
  return ((data ?? []) as PublicCatalogListingRow[]).map(mapPublicCatalogListingRow);
}

/**
 * Todas las fichas publicadas de una categoría. El RPC acota `page_size` a
 * 100, así que se recorre por páginas con un tope duro. Solo lo usa el
 * snapshot para expandir selecciones de tipo «categoría».
 */
export async function listAllPublicCatalogProductsInCategory(categoryId: string): Promise<PublicCatalogListingItem[]> {
  const items: PublicCatalogListingItem[] = [];
  for (let page = 1; page <= MAX_CATEGORY_PAGES; page += 1) {
    const result = await listPublicCatalogProducts({ categoryId, page, pageSize: CATEGORY_PAGE_SIZE });
    items.push(...result.items);
    if (items.length >= result.totalCount || result.items.length === 0) break;
  }
  return items;
}

/**
 * Primeras fichas de una categoría y su total, para las miniaturas del
 * detalle. Si `items.length >= totalCount` la lista está completa y el
 * snapshot puede reutilizarla sin volver a pedirla.
 */
export async function listPublicCatalogCategoryPreview(categoryId: string, limit: number): Promise<PublicCatalogListingResult> {
  return listPublicCatalogProducts({ categoryId, page: 1, pageSize: limit });
}

/**
 * Ficha completa por slug, con sus existencias; null si no existe o no está
 * publicada. Misma semántica que `getPublicCatalogProductBySlug` del web
 * (`catalog-public/queries.server.ts`): el stock se pide aparte y se
 * incrusta como `stockQuantity`.
 */
export async function getPublicCatalogProductBySlug(slug: string): Promise<PublicCatalogProductDetail | null> {
  const [product, stock] = await Promise.all([
    supabase.rpc('get_public_catalog_product', { product_slug: slug }),
    supabase.rpc('get_public_catalog_product_stock', { product_slug: slug }),
  ]);
  if (product.error) throw new Error(`No fue posible cargar la ficha: ${product.error.message}`);
  const data = product.data as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (stock.error) throw new Error(`No fue posible cargar la disponibilidad del producto: ${stock.error.message}`);
  return mapPublicCatalogProductDetail({
    ...(data as PublicCatalogProductDetailRaw),
    stockQuantity: Number(stock.data ?? 0),
  });
}

export type ProductDetailsProgress = { resolved: number; total: number };

/**
 * Fichas completas (con existencias) de varios slugs, indexadas por slug.
 * Los slugs sin ficha publicada no aparecen en el resultado.
 *
 * Es el ÚNICO punto por el que el móvil pide detalles de fichas: hoy son
 * dos RPC por slug con concurrencia acotada; cuando exista el RPC por lote
 * (`get_public_catalog_products_detail`) basta con cambiar el cuerpo de esta
 * función.
 */
export async function getPublicCatalogProductDetails(
  slugs: readonly string[],
  onProgress?: (progress: ProductDetailsProgress) => void
): Promise<Map<string, PublicCatalogProductDetail>> {
  const unique = [...new Set(slugs)];
  let resolved = 0;
  onProgress?.({ resolved, total: unique.length });
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += DETAIL_BATCH_SIZE) {
    chunks.push(unique.slice(index, index + DETAIL_BATCH_SIZE));
  }
  const bySlug = new Map<string, PublicCatalogProductDetail>();
  const batches = await mapWithConcurrency(chunks, DETAIL_CONCURRENCY, async (chunk) => {
    const batch = await getProductDetailsBatch(chunk);
    resolved += chunk.length;
    onProgress?.({ resolved, total: unique.length });
    return batch;
  });
  for (const batch of batches) {
    for (const [slug, productDetail] of batch) bySlug.set(slug, productDetail);
  }
  return bySlug;
}

/** Tope del RPC por lote (acepta hasta 200 slugs). */
const DETAIL_BATCH_SIZE = 100;

type ProductDetailBatchRow = { slug: string; detail: PublicCatalogProductDetailRaw | null };

/**
 * Un lote con `get_public_catalog_products_detail` (migración
 * 20261108120000): una llamada en vez de dos por ficha. Si la base aún no la
 * tiene, vuelve al camino de dos RPC por slug.
 */
async function getProductDetailsBatch(slugs: readonly string[]): Promise<Map<string, PublicCatalogProductDetail>> {
  const { data, error } = await supabase.rpc('get_public_catalog_products_detail', { p_slugs: [...slugs] });
  if (error?.code === 'PGRST202') {
    const details = await mapWithConcurrency(slugs, DETAIL_CONCURRENCY, async (slug) => [slug, await getPublicCatalogProductBySlug(slug)] as const);
    return new Map(details.filter((entry): entry is readonly [string, PublicCatalogProductDetail] => entry[1] !== null));
  }
  if (error) throw new Error(`No fue posible cargar las fichas: ${error.message}`);
  // El RPC devuelve el slug real de la ficha y compara sin mayúsculas: se
  // indexa por el slug tal como se pidió.
  const requested = new Map(slugs.map((slug) => [slug.toLowerCase(), slug] as const));
  const bySlug = new Map<string, PublicCatalogProductDetail>();
  for (const row of (data ?? []) as unknown as ProductDetailBatchRow[]) {
    const slug = requested.get(row.slug.toLowerCase());
    if (!slug || !row.detail || typeof row.detail !== 'object') continue;
    bySlug.set(slug, mapPublicCatalogProductDetail({ ...row.detail, stockQuantity: Number(row.detail.stockQuantity ?? 0) }));
  }
  return bySlug;
}

/** Categorías con al menos una ficha publicada. */
export async function listPublicCatalogCategories(): Promise<PublicCatalogCategory[]> {
  const { data, error } = await supabase.rpc('get_public_catalog_categories', {});
  if (error) throw new Error(`No fue posible cargar las categorías: ${error.message}`);
  return ((data ?? []) as PublicCatalogCategoryRow[]).map(mapPublicCatalogCategoryRow);
}
