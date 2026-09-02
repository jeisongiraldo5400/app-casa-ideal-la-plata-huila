import { buildRegisteredTotalsByKey } from '@/components/exits/infrastructure/utils/fifoDeliveryAllocation';
import { compositeKey } from '@/components/exits/infrastructure/utils/compositeKey';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];
type DeliveryOrderRow = Database['public']['Tables']['delivery_orders']['Row'];

export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/** Línea de orden con producto y bodega resueltos (RPC autorizado o consulta RLS). */
export type DeliveryOrderItemQueryRow = Pick<
  Database['public']['Tables']['delivery_order_items']['Row'],
  'id' | 'product_id' | 'warehouse_id' | 'quantity' | 'delivered_quantity' | 'created_at' | 'deleted_at' | 'source_delivery_order_id'
> & {
  product: Pick<Product, 'id' | 'name' | 'barcode' | 'sku' | 'deleted_at'> | null;
  warehouse: Pick<Warehouse, 'id' | 'name'> | null;
};

const DELIVERY_ORDER_ITEM_DETAIL_SELECT = `
  id,
  product_id,
  warehouse_id,
  quantity,
  delivered_quantity,
  created_at,
  deleted_at,
  source_delivery_order_id
`;

/**
 * Líneas de una orden que el usuario actual puede registrar. Usa el RPC autorizado y, solo
 * mientras la migración no exista (PGRST202), cae a las consultas con RLS.
 */
export async function fetchSelectableDeliveryOrderItems(
  orderId: string
): Promise<{ data: DeliveryOrderItemQueryRow[]; error: { message: string } | null }> {
  const rpcResult = await supabase.rpc('get_authorized_delivery_order_items', { p_order_id: orderId });

  if (!rpcResult.error) {
    return {
      data: (rpcResult.data || []).map((item: Database['public']['Functions']['get_authorized_delivery_order_items']['Returns'][number]) => ({
        id: item.id,
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        quantity: item.quantity,
        delivered_quantity: item.delivered_quantity,
        created_at: item.created_at,
        deleted_at: null,
        source_delivery_order_id: item.source_delivery_order_id,
        product: { id: item.product_id, name: item.product_name, barcode: item.product_barcode, sku: item.product_sku, deleted_at: null },
        warehouse: { id: item.warehouse_id, name: item.warehouse_name },
      })),
      error: null,
    };
  }

  if (rpcResult.error.code !== 'PGRST202') {
    return { data: [], error: rpcResult.error };
  }

  let itemResult = await supabase
    .from('delivery_order_items')
    .select(DELIVERY_ORDER_ITEM_DETAIL_SELECT)
    .eq('delivery_order_id', orderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (itemResult.error) return { data: [], error: itemResult.error };

  if (!itemResult.data?.length) {
    // Algunas órdenes de cliente llegan copiadas dentro de una remisión: la clave confiable es source_delivery_order_id.
    itemResult = await supabase
      .from('delivery_order_items')
      .select(DELIVERY_ORDER_ITEM_DETAIL_SELECT)
      .eq('source_delivery_order_id', orderId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (itemResult.error) return { data: [], error: itemResult.error };
  }

  const rawItems = itemResult.data || [];
  if (rawItems.length === 0) return { data: [], error: null };

  // Cargar catálogos por separado: un join !inner vacío eliminaba toda la respuesta.
  const productIds = [...new Set(rawItems.map((item) => item.product_id))];
  const warehouseIds = [...new Set(rawItems.map((item) => item.warehouse_id))];
  const [productsResult, warehousesResult] = await Promise.all([
    supabase.from('products').select('id, name, barcode, sku, deleted_at').in('id', productIds).is('deleted_at', null),
    supabase.from('warehouses').select('id, name').in('id', warehouseIds),
  ]);
  if (productsResult.error) return { data: [], error: productsResult.error };
  if (warehousesResult.error) return { data: [], error: warehousesResult.error };

  const productsById = new Map((productsResult.data || []).map((product) => [product.id, product]));
  const warehousesById = new Map((warehousesResult.data || []).map((warehouse) => [warehouse.id, warehouse]));

  return {
    data: rawItems.map((item) => ({
      ...item,
      product: productsById.get(item.product_id) || null,
      warehouse: warehousesById.get(item.warehouse_id) || null,
    })),
    error: null,
  };
}

export type InventoryExitRow = Pick<
  Database['public']['Tables']['inventory_exits']['Row'],
  'id' | 'delivery_order_id' | 'product_id' | 'warehouse_id' | 'quantity'
>;

/** Salidas registradas para una o varias órdenes. Lanza si la consulta falla. */
export async function fetchInventoryExitsForOrders(orderIds: string[]): Promise<InventoryExitRow[]> {
  if (orderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('inventory_exits')
    .select('id, delivery_order_id, product_id, warehouse_id, quantity')
    .in('delivery_order_id', orderIds);
  if (error) throw error;
  return data || [];
}

/**
 * IDs de salidas con cancelación activa. Lanza si la consulta falla: devolver un set vacío
 * contaría salidas canceladas como entregadas y ocultaría pendientes.
 */
export async function getActiveCancelledExitIds(exitIds: string[]): Promise<Set<string>> {
  if (exitIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('inventory_exit_cancellations')
    .select('inventory_exit_id')
    .in('inventory_exit_id', exitIds)
    .is('deleted_at', null);
  if (error) throw new Error(`No fue posible verificar las salidas canceladas: ${error.message}`);
  return new Set((data || []).map((cancellation) => cancellation.inventory_exit_id));
}

/** Suma por producto+bodega de las salidas no canceladas. */
export function aggregateExitsByKey(exits: InventoryExitRow[], cancelledIds: Set<string>): Record<string, number> {
  const totals: Record<string, number> = {};
  exits.forEach((exit) => {
    if (cancelledIds.has(exit.id)) return;
    if (!exit.product_id || !exit.warehouse_id) return;
    const key = compositeKey(exit.product_id, exit.warehouse_id);
    totals[key] = (totals[key] || 0) + (exit.quantity || 0);
  });
  return totals;
}

/** orderId -> (producto+bodega -> unidades) de las salidas no canceladas. */
export function groupExitsByOrder(exits: InventoryExitRow[], cancelledIds: Set<string>): Map<string, Map<string, number>> {
  const byOrder = new Map<string, Map<string, number>>();
  exits.forEach((exit) => {
    if (cancelledIds.has(exit.id)) return;
    if (!exit.delivery_order_id || !exit.product_id || !exit.warehouse_id) return;
    const key = compositeKey(exit.product_id, exit.warehouse_id);
    const orderMap = byOrder.get(exit.delivery_order_id) || new Map<string, number>();
    orderMap.set(key, (orderMap.get(key) || 0) + (exit.quantity || 0));
    byOrder.set(exit.delivery_order_id, orderMap);
  });
  return byOrder;
}

/** Suma de delivered_quantity (fuente de verdad en BD) por orden. Lanza si la consulta falla. */
export async function fetchDeliveredTotalsByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (orderIds.length === 0) return totals;
  const { data, error } = await supabase
    .from('delivery_order_items')
    .select('delivery_order_id, delivered_quantity')
    .in('delivery_order_id', orderIds)
    .is('deleted_at', null);
  if (error) throw error;
  (data || []).forEach((item) => {
    totals.set(item.delivery_order_id, (totals.get(item.delivery_order_id) || 0) + (item.delivered_quantity || 0));
  });
  return totals;
}

export type CustomerOrderItemRow = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  delivered_quantity: number | null;
  deleted_at: string | null;
  product: Pick<Product, 'id' | 'name' | 'barcode' | 'sku' | 'deleted_at'> | null;
};

export type CustomerOrderRow = DeliveryOrderRow & { items: CustomerOrderItemRow[] };

/** Órdenes pendientes de un cliente con sus líneas activas. Lanza si la consulta falla. */
export async function fetchPendingCustomerOrders(customerId: string): Promise<CustomerOrderRow[]> {
  const { data, error } = await supabase
    .from('delivery_orders')
    .select(
      `
      *,
      items:delivery_order_items!fk_delivery_order_item_order!inner(
        id,
        product_id,
        warehouse_id,
        quantity,
        delivered_quantity,
        deleted_at,
        product:products!inner(id, name, barcode, sku, deleted_at)
      )
    `
    )
    .eq('customer_id', customerId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .is('items.deleted_at', null)
    .is('items.product.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  // El select con pistas de relación (!fk_...) no lo infiere el generador de tipos.
  return (data || []) as unknown as CustomerOrderRow[];
}

export type UserOrderRow = Database['public']['Functions']['get_user_delivery_orders_expanded']['Returns'][number];

/** Órdenes/remisiones asignadas a un usuario, expandidas por el RPC. Lanza si falla. */
export async function fetchUserOrdersExpanded(userId: string): Promise<UserOrderRow[]> {
  const { data, error } = await supabase.rpc('get_user_delivery_orders_expanded', { p_user_id: userId });
  if (error) throw error;
  return data || [];
}

/**
 * Re-lee inventory_exits + delivery_order_items de una orden y devuelve los totales
 * registrados por clave y si la orden quedó completa. Usado tras registrar una salida.
 */
export async function loadOrderRegisteredTotals(
  orderId: string
): Promise<{ totals: Record<string, number>; completed: boolean } | null> {
  const exits = await fetchInventoryExitsForOrders([orderId]);
  const cancelledExitIds = await getActiveCancelledExitIds(exits.map((exit) => exit.id));
  const registeredByKey = aggregateExitsByKey(exits, cancelledExitIds);

  const { data: orderData, error: orderError } = await supabase
    .from('delivery_orders')
    .select(
      `
      items:delivery_order_items!fk_delivery_order_item_order!inner(
        id,
        product_id,
        warehouse_id,
        quantity,
        delivered_quantity,
        created_at,
        deleted_at
      )
    `
    )
    .eq('id', orderId)
    .is('items.deleted_at', null)
    .single();
  if (orderError) throw orderError;
  if (!orderData?.items) return null;

  const fifoInputs = orderData.items.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    warehouse_id: item.warehouse_id,
    quantity: Number(item.quantity) || 0,
    db_delivered_quantity: Number(item.delivered_quantity) || 0,
    created_at: item.created_at || EPOCH_ISO,
  }));
  const totals = buildRegisteredTotalsByKey(fifoInputs, registeredByKey);
  Object.keys(totals).forEach((k) => {
    if (totals[k] <= 0) delete totals[k];
  });
  const completed = fifoInputs.length > 0 && fifoInputs.every((item) => item.db_delivered_quantity >= item.quantity);
  return { totals, completed };
}
