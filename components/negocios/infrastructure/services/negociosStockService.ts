import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalCatalog,
  hasLocalCatalog,
  stockForProductFromLocal,
  stockForProductsFromLocal,
} from '@/lib/offline/repositories/catalogRepository';

export type ProductWarehouseStock = {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
};

export type NegocioStockItem = {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  description?: string;
};

export function validateNegocioItemsInput(items: NegocioStockItem[]): void {
  if (!items.length) throw new Error('Agregue al menos un producto');

  for (const item of items) {
    if (!item.product_id || !item.warehouse_id) {
      throw new Error('Cada producto debe tener una bodega válida');
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Cada producto debe tener una cantidad entera mayor a 0');
    }
    const price = (item as NegocioStockItem & { unit_price?: number }).unit_price;
    if (price !== undefined && (!Number.isSafeInteger(price) || price <= 0)) {
      throw new Error('Cada producto debe tener un valor unitario válido mayor a 0');
    }
  }
}

export function aggregateNegocioStockItems(items: NegocioStockItem[]): NegocioStockItem[] {
  const grouped = new Map<string, NegocioStockItem>();
  for (const item of items) {
    const key = `${item.product_id}:${item.warehouse_id}`;
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, quantity: current.quantity + item.quantity } : { ...item });
  }
  return [...grouped.values()];
}

export async function fetchProductWarehouseStock(
  productId: string
): Promise<ProductWarehouseStock[]> {
  try {
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('warehouse_id, quantity, warehouse:warehouses(name)')
      .eq('product_id', productId)
      .gt('quantity', 0)
      .order('quantity', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((row: any) => ({
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse?.name ?? 'Bodega',
      quantity: Number(row.quantity) || 0,
    }));
  } catch (error) {
    // Sin señal se usan las existencias de la última descarga. La pantalla lo
    // advierte: puede que en la bodega ya no quede lo que aquí se ve.
    if (!isNetworkError(error) || !canUseLocalCatalog()) throw error;
    if (!(await hasLocalCatalog())) throw error;
    return stockForProductFromLocal(productId);
  }
}

/**
 * Existencias de varios productos, diciendo de dónde salieron: `fromLocal`
 * significa «esto es lo de la última descarga», y la pantalla lo muestra.
 */
export async function fetchStockForProductsWithSource(
  productIds: string[]
): Promise<{ stock: Record<string, ProductWarehouseStock[]>; fromLocal: boolean }> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (!uniqueIds.length) return { stock: {}, fromLocal: false };

  try {
    const entries = await Promise.all(
      uniqueIds.map(async (productId) => {
        const { data, error } = await supabase
          .from('warehouse_stock')
          .select('warehouse_id, quantity, warehouse:warehouses(name)')
          .eq('product_id', productId)
          .gt('quantity', 0)
          .order('quantity', { ascending: false });
        if (error) throw new Error(error.message);
        const rows = (data || []).map((row: any) => ({
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouse?.name ?? 'Bodega',
          quantity: Number(row.quantity) || 0,
        }));
        return [productId, rows] as const;
      })
    );
    return { stock: Object.fromEntries(entries), fromLocal: false };
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalCatalog()) throw error;
    if (!(await hasLocalCatalog())) throw error;
    return { stock: await stockForProductsFromLocal(uniqueIds), fromLocal: true };
  }
}

export async function fetchStockForProducts(
  productIds: string[]
): Promise<Record<string, ProductWarehouseStock[]>> {
  return (await fetchStockForProductsWithSource(productIds)).stock;
}

export function reservedQtyInItems(
  items: NegocioStockItem[],
  productId: string,
  warehouseId: string,
  excludeIndex?: number
): number {
  return items.reduce((sum, item, index) => {
    if (excludeIndex === index) return sum;
    if (item.product_id === productId && item.warehouse_id === warehouseId) {
      return sum + item.quantity;
    }
    return sum;
  }, 0);
}

export function availableQtyForItem(
  stockByProduct: Record<string, ProductWarehouseStock[]>,
  items: NegocioStockItem[],
  productId: string,
  warehouseId: string,
  excludeIndex?: number
): number {
  const row = stockByProduct[productId]?.find((s) => s.warehouse_id === warehouseId);
  if (!row) return 0;
  return Math.max(
    row.quantity - reservedQtyInItems(items, productId, warehouseId, excludeIndex),
    0
  );
}

export type StockAvailability = {
  total: number;
  reserved: number;
  available: number;
};

export function getWarehouseStockTotal(
  stockRows: ProductWarehouseStock[],
  warehouseId: string
): number {
  return stockRows.find((s) => s.warehouse_id === warehouseId)?.quantity ?? 0;
}

export function getAddFormAvailability(
  stockRows: ProductWarehouseStock[],
  items: NegocioStockItem[],
  productId: string,
  warehouseId: string
): StockAvailability {
  const total = getWarehouseStockTotal(stockRows, warehouseId);
  const reserved = reservedQtyInItems(items, productId, warehouseId);
  return {
    total,
    reserved,
    available: Math.max(total - reserved, 0),
  };
}

export function parseNegocioQuantity(value: string | number): number {
  if (typeof value === 'number') return value;
  const normalized = String(value).replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function parseNegocioMoney(value: string | number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  // Los valores monetarios se muestran como COP enteros con puntos de miles
  // (por ejemplo, "1.990.000"). Esos puntos son separadores visuales, no
  // decimales, así que se deben retirar antes de convertir el valor.
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return NaN;

  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : NaN;
}

export function formatNegocioMoneyInput(value: string | number): string {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export async function validateNegocioItemsStock(
  items: NegocioStockItem[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const item of aggregateNegocioStockItems(items)) {
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('quantity, warehouse:warehouses(name), product:products(name)')
      .eq('product_id', item.product_id)
      .eq('warehouse_id', item.warehouse_id)
      .maybeSingle();

    if (error) {
      return { ok: false, message: error.message };
    }

    const available = Number(data?.quantity ?? 0);
    const productName =
      item.description || (data as any)?.product?.name || 'Producto';
    const warehouseName =
      (data as any)?.warehouse?.name || 'la bodega seleccionada';

    if (available < item.quantity) {
      if (available === 0) {
        return {
          ok: false,
          message: `No hay stock de "${productName}" en ${warehouseName}. Seleccione la bodega correcta al agregar el ítem.`,
        };
      }
      return {
        ok: false,
        message: `Stock insuficiente para "${productName}" en ${warehouseName}. Disponible: ${available}, solicitado: ${item.quantity}.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Misma validación contra las existencias de la última descarga. Es lo único
 * que se puede comprobar sin señal, y NO es una promesa: el servidor vuelve a
 * mirar el stock real cuando el negocio sale de la cola y puede rechazarlo.
 */
export async function validateNegocioItemsStockLocal(
  items: NegocioStockItem[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const aggregated = aggregateNegocioStockItems(items);
  const stock = await stockForProductsFromLocal(aggregated.map((item) => item.product_id));
  for (const item of aggregated) {
    const row = (stock[item.product_id] || []).find(
      (candidate) => candidate.warehouse_id === item.warehouse_id
    );
    const available = Number(row?.quantity ?? 0);
    const productName = item.description || 'Producto';
    const warehouseName = row?.warehouse_name || 'la bodega seleccionada';
    if (available < item.quantity) {
      return {
        ok: false,
        message:
          available === 0
            ? `Según la última descarga no hay stock de "${productName}" en ${warehouseName}.`
            : `Según la última descarga sólo hay ${available} de "${productName}" en ${warehouseName} y se piden ${item.quantity}.`,
      };
    }
  }
  return { ok: true };
}

export function itemsHaveValidStock(
  items: NegocioStockItem[],
  stockByProduct: Record<string, ProductWarehouseStock[]>
): boolean {
  return items.every((item, idx) =>
    availableQtyForItem(
      stockByProduct,
      items,
      item.product_id,
      item.warehouse_id,
      idx
    ) >= item.quantity
  );
}
