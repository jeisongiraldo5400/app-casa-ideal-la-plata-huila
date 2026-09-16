import { fetchInChunks, IN_FILTER_PAGE_SIZE } from '@/lib/inChunks';
import { supabase } from '@/lib/supabase';
import {
  PURCHASE_ORDER_RECEIPT_ENTRY_TYPE,
  isPurchaseOrderReceipt,
} from '@/components/purchase-orders/domain/purchaseOrderReceipts';
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

/**
 * Recepciones vigentes (PO_ENTRY no eliminadas) de una o varias órdenes de compra.
 * Las devoluciones a proveedor ('return') llevan la misma orden y no cuentan como
 * recibido. Lanza si falla.
 */
export async function fetchInventoryEntriesForOrders(orderIds: string[]): Promise<InventoryEntryRow[]> {
  if (orderIds.length === 0) return [];
  // En lotes (URL corta) y por páginas: cada orden acumula varias recepciones.
  const data = await fetchInChunks(
    orderIds,
    (chunk) =>
      supabase
        .from('inventory_entries')
        .select('purchase_order_id, product_id, quantity, entry_type')
        .in('purchase_order_id', chunk)
        .eq('entry_type', PURCHASE_ORDER_RECEIPT_ENTRY_TYPE)
        .is('deleted_at', null)
        .order('id', { ascending: true }),
    { pageSize: IN_FILTER_PAGE_SIZE }
  );
  return data
    .filter(isPurchaseOrderReceipt)
    .map(({ purchase_order_id, product_id, quantity }) => ({ purchase_order_id, product_id, quantity }));
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

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return String(error);
}

/** Bodega, productos y estado de la orden en paralelo, para validar antes de registrar. */
export async function fetchEntryValidationData(params: {
  warehouseId: string;
  productIds: string[];
  purchaseOrderId: string | null;
}): Promise<EntryValidationData> {
  // Los productos van en lotes: una recepción grande puede traer cientos de referencias.
  const productsQuery = fetchInChunks(params.productIds, (chunk) =>
    supabase.from('products').select('id, deleted_at').in('id', chunk)
  ).then(
    (rows) => ({ data: rows, error: null }),
    (error: unknown) => ({ data: null, error: { message: errorText(error) } })
  );
  const [warehouseResult, productsResult, orderResult] = await Promise.all([
    supabase.from('warehouses').select('id, is_active, deleted_at').eq('id', params.warehouseId).maybeSingle(),
    productsQuery,
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
