import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalCatalog,
  catalogProductIdsWithStockInFromLocal,
  findCatalogProductByBarcodeFromLocal,
  hasLocalCatalog,
  searchCatalogProductsFromLocal,
  searchCatalogProductsInWarehousesFromLocal,
} from '@/lib/offline/repositories/catalogRepository';
import {
  allowedSaleWarehouseIds,
  type SaleWarehouseAccess,
} from '@/components/negocios/domain/saleWarehouses';

/** Sin red y sin catálogo bajado no hay nada que buscar: hay que decirlo. */
export const SIN_CATALOGO_LOCAL =
  'Sin conexión y sin catálogo descargado. Conéctese y pulse «Descargar información» para poder armar negocios sin señal.';

/** Sin señal con productos «ninguno» en Preparar el teléfono. */
export const SIN_PRODUCTOS_EN_EL_TELEFONO =
  'No llevas productos en el teléfono; actívalos en Preparar el teléfono.';

/**
 * Sin señal, con catálogo en el teléfono pero sin el producto buscado: no
 * estaba en la última descarga (o no existe).
 */
export function productoNoEstaEnElTelefono(term: string): string {
  return `«${term.trim()}» no está en el teléfono: no vino en la última descarga. Si es nuevo, con señal pulse «Descargar» en Preparar el teléfono.`;
}

/**
 * Aviso del buscador de productos del asistente sin señal, o null. Con
 * productos «ninguno» lo dice de entrada; si no, solo cuando la búsqueda del
 * término escrito ya terminó sin resultados (para no avisar a medias).
 */
export function productSearchNotice(input: {
  offline: boolean;
  noProductsOnPhone: boolean;
  query: string;
  searchedQuery: string;
  resultsCount: number;
}): string | null {
  if (!input.offline) return null;
  const query = input.query.trim();
  if (!query) return null;
  if (input.noProductsOnPhone) return SIN_PRODUCTOS_EN_EL_TELEFONO;
  if (input.searchedQuery === query && input.resultsCount === 0) {
    return productoNoEstaEnElTelefono(query);
  }
  return null;
}

export type NegocioProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string;
};

// Sin sale_price: los productos no tienen precio de venta (20261028160000).
const PRODUCT_FIELDS = 'id, name, sku, barcode';

function safeSearchTerm(value: string) {
  return value.trim().replace(/[,()%_'"\\]/g, ' ').replace(/\s+/g, ' ');
}

/** El catálogo local guarda sku y barcode opcionales; la pantalla espera texto. */
function fromLocalProduct(row: {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
}): NegocioProduct {
  return { id: row.id, name: row.name, sku: row.sku || '', barcode: row.barcode || '' };
}

/**
 * Con bodegas de venta restringidas (3.5.0) solo se piden productos con
 * existencias > 0 en las bodegas permitidas: el JOIN `!inner` deja fuera los
 * demás. Una fila por producto (el stock viene anidado), igual se desduplica.
 */
const RESTRICTED_PRODUCT_FIELDS = `${PRODUCT_FIELDS}, warehouse_stock!inner(warehouse_id, quantity)`;

function toNegocioProducts(rows: unknown[] | null): NegocioProduct[] {
  const seen = new Set<string>();
  const out: NegocioProduct[] = [];
  for (const raw of rows || []) {
    const row = raw as NegocioProduct;
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, name: row.name, sku: row.sku, barcode: row.barcode });
  }
  return out;
}

/**
 * Busca productos para el negocio. `access` solo se pasa con origen «desde
 * bodega»: restringido, devuelve únicamente productos con stock en las bodegas
 * de venta del usuario; sin ninguna, no consulta y devuelve vacío.
 */
export async function searchProductsForNegocio(
  query: string,
  access?: SaleWarehouseAccess | null
): Promise<NegocioProduct[]> {
  const term = safeSearchTerm(query);
  if (!term) return [];
  const allowedIds = allowedSaleWarehouseIds(access);
  if (allowedIds && !allowedIds.length) return [];

  try {
    let request = supabase
      .from('products')
      .select(allowedIds ? RESTRICTED_PRODUCT_FIELDS : PRODUCT_FIELDS)
      .is('deleted_at', null)
      .eq('status', true);
    if (allowedIds) {
      request = request
        .in('warehouse_stock.warehouse_id', [...allowedIds])
        .gt('warehouse_stock.quantity', 0);
    }
    const { data, error } = await request
      .or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`)
      .order('name')
      .limit(20);

    if (error) throw new Error(`No fue posible buscar productos: ${error.message}`);
    return allowedIds ? toNegocioProducts(data) : ((data || []) as unknown as NegocioProduct[]);
  } catch (error) {
    // Sin señal se busca en el catálogo de la última descarga.
    if (!isNetworkError(error) || !canUseLocalCatalog()) throw error;
    if (!(await hasLocalCatalog())) throw new Error(SIN_CATALOGO_LOCAL);
    const local = allowedIds
      ? await searchCatalogProductsInWarehousesFromLocal(term, allowedIds, 20)
      : await searchCatalogProductsFromLocal(term, 20);
    return local.map(fromLocalProduct);
  }
}

/**
 * Producto activo por código exacto. Con `access` restringido devuelve null si
 * no tiene existencias en las bodegas de venta del usuario.
 */
export async function findActiveProductByBarcode(
  barcode: string,
  access?: SaleWarehouseAccess | null
): Promise<NegocioProduct | null> {
  const normalized = barcode.trim();
  if (!normalized) return null;
  const allowedIds = allowedSaleWarehouseIds(access);
  if (allowedIds && !allowedIds.length) return null;

  try {
    let request = supabase
      .from('products')
      .select(allowedIds ? RESTRICTED_PRODUCT_FIELDS : PRODUCT_FIELDS)
      .eq('barcode', normalized)
      .is('deleted_at', null)
      .eq('status', true);
    if (allowedIds) {
      request = request
        .in('warehouse_stock.warehouse_id', [...allowedIds])
        .gt('warehouse_stock.quantity', 0);
    }
    const { data, error } = await request.maybeSingle();

    if (error) throw new Error(`No fue posible buscar el código: ${error.message}`);
    if (!data) return null;
    return toNegocioProducts([data])[0] ?? null;
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalCatalog()) throw error;
    const local = await findCatalogProductByBarcodeFromLocal(normalized);
    if (!local) return null;
    if (allowedIds) {
      const withStock = await catalogProductIdsWithStockInFromLocal(allowedIds);
      if (!withStock.has(local.id)) return null;
    }
    return fromLocalProduct(local);
  }
}
