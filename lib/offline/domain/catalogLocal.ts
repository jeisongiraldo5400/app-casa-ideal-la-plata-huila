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

/** Producto del catálogo descargado con su categoría (para el filtro de Inventario). */
export type LocalInventoryProduct = LocalCatalogProduct & { categoryId: string | null };

export type LocalInventoryQuery = {
  search: string;
  warehouseId: string | null;
  categoryId: string | null;
  page: number;
  pageSize: number;
};

export type LocalInventoryRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  status: boolean;
  totalStock: number;
  stock: { warehouse_id: string; warehouse_name: string; quantity: number }[];
};

/**
 * Inventario sin señal: una página del catálogo descargado con los mismos
 * filtros que `get_products_dashboard` (texto sin tildes en nombre, SKU o
 * código; bodega = con existencias > 0 en ella; categoría). Marca, categoría y
 * color no viajan con nombre en la descarga, así que la búsqueda no los mira.
 * Orden por nombre: la fecha de creación tampoco viaja.
 */
export function queryLocalInventory(
  products: LocalInventoryProduct[],
  stock: LocalCatalogStockRow[],
  warehouseNames: Map<string, string>,
  query: LocalInventoryQuery
): { rows: LocalInventoryRow[]; totalCount: number } {
  const term = (query.search || '').trim();
  const stockByProduct = new Map<string, LocalCatalogStockRow[]>();
  for (const row of stock) {
    const list = stockByProduct.get(row.productId) ?? [];
    list.push(row);
    stockByProduct.set(row.productId, list);
  }
  const filtered = products
    .filter((product) => !term || matchesCatalogProduct(product, term))
    .filter((product) => !query.categoryId || product.categoryId === query.categoryId)
    .filter(
      (product) =>
        !query.warehouseId ||
        (stockByProduct.get(product.id) ?? []).some(
          (row) => row.warehouseId === query.warehouseId && Number(row.quantity) > 0
        )
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const pageSize = Math.max(query.pageSize, 1);
  const start = (Math.max(query.page, 1) - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize).map((product) => {
    const productStock = stockRowsForProduct(stockByProduct.get(product.id) ?? [], warehouseNames, product.id);
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      status: product.status !== false,
      totalStock: productStock.reduce((sum, row) => sum + row.quantity, 0),
      stock: productStock,
    };
  });
  return { rows, totalCount: filtered.length };
}
