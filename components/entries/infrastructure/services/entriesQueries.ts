import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import type { PurchaseOrderWithItems } from '@/components/entries/infrastructure/store/entriesStore';

type Product = Database['public']['Tables']['products']['Row'];
type Supplier = Database['public']['Tables']['suppliers']['Row'];

type PurchaseOrderDetailRow = Database['public']['Tables']['purchase_orders']['Row'] & {
  supplier: Pick<Supplier, 'id' | 'name' | 'nit'> | null;
  items: (Database['public']['Tables']['purchase_order_items']['Row'] & {
    product: Pick<Product, 'id' | 'name' | 'barcode' | 'sku' | 'deleted_at'> | null;
  })[];
};

/** Orden de compra con proveedor y líneas activas. Lanza si la consulta falla; null si no existe. */
export async function fetchPurchaseOrderDetail(purchaseOrderId: string): Promise<PurchaseOrderWithItems | null> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(
      `
      *,
      supplier:suppliers(id, name, nit),
      items:purchase_order_items!inner(
        id,
        product_id,
        purchase_order_id,
        quantity,
        deleted_at,
        product:products!inner(id, name, barcode, sku, deleted_at)
      )
    `
    )
    .eq('id', purchaseOrderId)
    .is('items.deleted_at', null)
    .is('items.product.deleted_at', null)
    .single();
  if (error) throw error;
  if (!data) return null;

  // El select anidado con !inner no lo infiere el generador de tipos.
  const row = data as unknown as PurchaseOrderDetailRow;
  return {
    ...row,
    supplier: (row.supplier || undefined) as Supplier | undefined,
    items: row.items
      .filter((item) => !item.deleted_at && item.product && !item.product.deleted_at)
      .map((item) => ({ ...item, product: item.product as Product })),
  };
}

export type InventoryEntryRow = {
  purchase_order_id: string | null;
  product_id: string | null;
  quantity: number;
};

/** Entradas registradas (no eliminadas) de una o varias órdenes de compra. Lanza si falla. */
export async function fetchInventoryEntriesForOrders(orderIds: string[]): Promise<InventoryEntryRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('inventory_entries')
    .select('purchase_order_id, product_id, quantity')
    .in('purchase_order_id', orderIds)
    .is('deleted_at', null);
  if (error) throw error;
  return data || [];
}

export type EntryValidationData = {
  warehouse: { id: string; is_active: boolean | null; deleted_at: string | null } | null;
  products: { id: string; deleted_at: string | null }[];
  /** undefined cuando no se consultó (sin orden); null cuando la orden no existe. */
  orderStatus: string | null | undefined;
};

export class EntryValidationQueryError extends Error {
  constructor(public readonly step: 'warehouse' | 'products' | 'order', message: string) {
    super(message);
  }
}

/** Bodega, productos y estado de la orden en paralelo, para validar antes de registrar. */
export async function fetchEntryValidationData(params: {
  warehouseId: string;
  productIds: string[];
  purchaseOrderId: string | null;
}): Promise<EntryValidationData> {
  const [warehouseResult, productsResult, orderResult] = await Promise.all([
    supabase.from('warehouses').select('id, is_active, deleted_at').eq('id', params.warehouseId).maybeSingle(),
    supabase.from('products').select('id, deleted_at').in('id', params.productIds),
    params.purchaseOrderId
      ? supabase.from('purchase_orders').select('status').eq('id', params.purchaseOrderId).maybeSingle()
      : Promise.resolve(null),
  ]);

  if (warehouseResult.error) throw new EntryValidationQueryError('warehouse', warehouseResult.error.message);
  if (productsResult.error) throw new EntryValidationQueryError('products', productsResult.error.message);
  if (orderResult?.error) throw new EntryValidationQueryError('order', orderResult.error.message);

  return {
    warehouse: warehouseResult.data,
    products: productsResult.data || [],
    orderStatus: orderResult === null ? undefined : orderResult.data?.status ?? null,
  };
}
