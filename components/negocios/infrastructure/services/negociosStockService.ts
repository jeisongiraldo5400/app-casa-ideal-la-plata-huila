import { supabase } from '@/lib/supabase';

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

export async function fetchProductWarehouseStock(
  productId: string
): Promise<ProductWarehouseStock[]> {
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
}

export async function fetchStockForProducts(
  productIds: string[]
): Promise<Record<string, ProductWarehouseStock[]>> {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const entries = await Promise.all(
    uniqueIds.map(async (productId) =>
      [productId, await fetchProductWarehouseStock(productId)] as const
    )
  );

  return Object.fromEntries(entries);
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
  return parseNegocioQuantity(value);
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
  for (const item of items) {
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
