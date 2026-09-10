import { supabase } from '@/lib/supabase';
import { toDeliveryOrderItem } from '../../domain/deliveryOrderItem';
import { DeliveryOrderItem } from '../../types';

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
  notes: string | null;
  product: { name: string | null; sku: string | null; barcode: string | null } | null;
  warehouse: { name: string | null } | null;
}

/**
 * Productos de una orden de entrega leídos de la tabla con RLS: sólo los ve
 * quien administra o creó la orden. Es el origen de "Todas las órdenes"; los
 * flujos donde el usuario únicamente tiene la orden asignada usan el RPC
 * autorizado (ver `myOrdersService`).
 */
export async function fetchDeliveryOrderItems(orderId: string): Promise<DeliveryOrderItem[]> {
  const { data, error } = await supabase
    .from('delivery_order_items')
    .select(DELIVERY_ORDER_ITEMS_SELECT)
    .eq('delivery_order_id', orderId)
    .is('deleted_at', null)
    .is('product.deleted_at', null)
    .returns<DeliveryOrderItemRow[]>();

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
      notes: row.notes,
    }),
  );
}
