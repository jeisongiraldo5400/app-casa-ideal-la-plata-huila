import { matchesDigits, matchesNormalized, normalizeText } from '@/lib/search/normalizeText';

/**
 * Reglas puras del catálogo descargado (productos y existencias).
 *
 * El repositorio lee WatermelonDB y delega aquí, para poder probar el
 * comportamiento sin base de datos ni red.
 */

export type LocalCatalogProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  status: boolean;
};

export type LocalCatalogStockRow = {
  productId: string;
  warehouseId: string;
  quantity: number;
};

/**
 * Mismo criterio que la búsqueda con red (`products.name/sku/barcode`), pero
 * sin tildes: aquí no hay `norm_text` que lo resuelva en el servidor.
 */
export function matchesCatalogProduct(product: LocalCatalogProduct, term: string): boolean {
  if (!normalizeText(term)) return false;
  return (
    matchesNormalized(term, product.name, product.sku, product.barcode) ||
    matchesDigits(term, product.sku, product.barcode)
  );
}

export function filterCatalogProducts(
  products: LocalCatalogProduct[],
  term: string,
  limit = 20
): LocalCatalogProduct[] {
  const query = (term || '').trim();
  if (!query) return [];
  return products
    .filter((product) => product.status !== false && matchesCatalogProduct(product, query))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Existencias por bodega de un producto, en el mismo formato que devuelve el
 * servidor: sólo bodegas con cantidad y de mayor a menor.
 */
export function stockRowsForProduct(
  stock: LocalCatalogStockRow[],
  warehouseNames: Map<string, string>,
  productId: string
) {
  return stock
    .filter((row) => row.productId === productId && row.quantity > 0)
    .map((row) => ({
      warehouse_id: row.warehouseId,
      warehouse_name: warehouseNames.get(row.warehouseId) || 'Bodega',
      quantity: Number(row.quantity) || 0,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}
