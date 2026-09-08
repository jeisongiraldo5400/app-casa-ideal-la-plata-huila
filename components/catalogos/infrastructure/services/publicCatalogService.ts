import { supabase } from '@/lib/supabase';
import { CATEGORY_PAGE_SIZE, MAX_CATEGORY_PAGES, PICKER_PAGE_SIZE } from '@/lib/catalogos/constants';
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
// exponen fichas `published` sobre productos activos; nunca sku ni stock.

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
 * snapshot para expandir capítulos de tipo «categoría».
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

/** Ficha completa por slug; null si no existe o no está publicada. */
export async function getPublicCatalogProductBySlug(slug: string): Promise<PublicCatalogProductDetail | null> {
  const { data, error } = await supabase.rpc('get_public_catalog_product', { product_slug: slug });
  if (error) throw new Error(`No fue posible cargar la ficha: ${error.message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return mapPublicCatalogProductDetail(data as unknown as PublicCatalogProductDetailRaw);
}

/** Categorías con al menos una ficha publicada. */
export async function listPublicCatalogCategories(): Promise<PublicCatalogCategory[]> {
  const { data, error } = await supabase.rpc('get_public_catalog_categories', {});
  if (error) throw new Error(`No fue posible cargar las categorías: ${error.message}`);
  return ((data ?? []) as PublicCatalogCategoryRow[]).map(mapPublicCatalogCategoryRow);
}
