import { supabase } from '@/lib/supabase';
import { toDeliveryOrderItem } from '../../domain/deliveryOrderItem';
import { DeliveryOrderItem } from '../../types';
import { readReturnedQuantity, returnedQuantityGate, withReturnedQuantity } from './returnedQuantityColumn';

const DELIVERY_ORDER_ITEMS_SELECT = `
  id,
  product_id,
  warehouse_id,
  quantity,
  delivered_quantity,
  deleted_at,
  notes,
  product:products!inner(id, name, sku, barcode, deleted_at),
  warehouse:warehouses(id, name)
`;

interface DeliveryOrderItemRow {
  id: string;
  product_id: string;
  warehouse_id: string | null;
  quantity: number | null;
  delivered_quantity: number | null;
  /** Ausente mientras la migración de devoluciones no esté aplicada. */
  returned_quantity?: number | null;
  notes: string | null;
  product: { name: string | null; sku: string | null; barcode: string | null } | null;
  warehouse: { name: string | null } | null;
}

/** PostgREST cuando la función todavía no existe en la base. */
const FUNCTION_NOT_FOUND = 'PGRST202';

/** Fila de `get_delivery_order_items_overview`; el cliente no lleva genérico. */
interface DeliveryOrderItemOverviewRow {
  id: string;
  product_id: string;
  warehouse_id: string | null;
  quantity: number | string | null;
  delivered_quantity: number | string | null;
  returned_quantity: number | string | null;
  product_name: string | null;
  product_sku: string | null;
  product_barcode: string | null;
  warehouse_name: string | null;
  notes: string | null;
  source_delivery_order_id: string | null;
  source_order_number: string | null;
  source_customer_name: string | null;
}

/**
 * Productos de una orden para consultarlos desde un listado.
 *
 * Va por `get_delivery_order_items_overview`, que responde a cualquier sesión:
 * la tabla con RLS solo deja ver al administrador, al bodeguero y a quien creó
 * la orden, así que un vendedor o un gestor de cobro abría el modal y no veía
 * nada. Mientras la migración no esté aplicada (PGRST202) se lee la tabla, que
 * es exactamente el comportamiento anterior.
 */
export async function fetchDeliveryOrderItemsForViewing(orderId: string): Promise<DeliveryOrderItem[]> {
  const { data, error } = await supabase.rpc('get_delivery_order_items_overview', {
    p_order_id: orderId,
  });

  if (error) {
    if (error.code !== FUNCTION_NOT_FOUND) {
      throw new Error(error.message || 'No fue posible cargar los productos de la orden.');
    }
    return fetchDeliveryOrderItems(orderId);
  }

  const rows: DeliveryOrderItemOverviewRow[] = Array.isArray(data) ? data : [];
  return rows.map((row) =>
    toDeliveryOrderItem({
      id: row.id,
      product_id: row.product_id,
      product_name: row.product_name,
      product_sku: row.product_sku,
      product_barcode: row.product_barcode,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      quantity: row.quantity,
      delivered_quantity: row.delivered_quantity,
      returned_quantity: row.returned_quantity,
      notes: row.notes,
      source_delivery_order_id: row.source_delivery_order_id,
      source_order_number: row.source_order_number,
      source_customer_name: row.source_customer_name,
    }),
  );
}

/**
 * Productos de una orden de entrega leídos de la tabla con RLS: sólo los ve
 * quien administra o creó la orden. Queda como respaldo de
 * `fetchDeliveryOrderItemsForViewing`; los flujos donde el usuario únicamente
 * tiene la orden asignada usan el RPC autorizado (ver `myOrdersService`).
 */
export async function fetchDeliveryOrderItems(orderId: string): Promise<DeliveryOrderItem[]> {
  const { data, error } = await returnedQuantityGate.run((withColumn) =>
    supabase
      .from('delivery_order_items')
      .select(withReturnedQuantity(DELIVERY_ORDER_ITEMS_SELECT, withColumn))
      .eq('delivery_order_id', orderId)
      .is('deleted_at', null)
      .is('product.deleted_at', null)
      .returns<DeliveryOrderItemRow[]>(),
  );

  if (error) throw new Error(error.message || 'No fue posible cargar los productos de la orden.');

  return (data || []).map((row) =>
    toDeliveryOrderItem({
      id: row.id,
      product_id: row.product_id,
      product_name: row.product?.name ?? null,
      product_sku: row.product?.sku ?? null,
      product_barcode: row.product?.barcode ?? null,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse?.name ?? null,
      quantity: row.quantity,
      delivered_quantity: row.delivered_quantity,
      returned_quantity: readReturnedQuantity(row),
      notes: row.notes,
    }),
  );
}
