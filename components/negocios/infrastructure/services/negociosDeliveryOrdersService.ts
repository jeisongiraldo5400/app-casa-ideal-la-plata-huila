import { supabase } from '@/lib/supabase';
import type { ProductWarehouseStock } from './negociosStockService';

export interface DeliveryOrderItemOption {
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  available_quantity: number;
  sale_price: number;
}

export type DeliveryOrderOriginKind = 'remission' | 'customer';

export interface DeliveryOrderOption {
  id: string;
  order_number: string;
  created_at: string;
  order_type: DeliveryOrderOriginKind;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_id_number: string | null;
  assigned_user_name: string | null;
  items: DeliveryOrderItemOption[];
}

export function deliveryOrderAvailabilityKey(
  orderId: string,
  productId: string,
  warehouseId: string
): string {
  return `${orderId}_${productId}_${warehouseId}`;
}

export function negocioSkipsWarehouseStock(input: {
  remission_id?: string | null;
  source_delivery_order_id?: string | null;
}): boolean {
  return Boolean(input.remission_id || input.source_delivery_order_id);
}

export function isEligibleSourceDeliveryOrder(order: {
  order_type: string;
  status: string;
  negocio_id?: string | null;
}): boolean {
  if (order.status === 'cancelled') return false;
  if (order.order_type === 'remission') return true;
  if (order.order_type === 'customer') {
    return !order.negocio_id && order.status !== 'sent_by_remission';
  }
  return false;
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function unwrapMany<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function stockMapFromDeliveryOrder(
  order: DeliveryOrderOption | null
): Record<string, ProductWarehouseStock[]> {
  if (!order) return {};
  const map: Record<string, ProductWarehouseStock[]> = {};
  for (const item of order.items || []) {
    if (!item?.product_id || !item.warehouse_id) continue;
    const rows = map[item.product_id] ?? [];
    rows.push({
      warehouse_id: item.warehouse_id,
      warehouse_name: item.warehouse_name,
      quantity: item.available_quantity,
    });
    map[item.product_id] = rows;
  }
  return map;
}

export function mapSoldQuantities(
  soldNegocios: Array<{
    remission_id?: string | null;
    source_delivery_order_id?: string | null;
    negocio_items?: Array<{
      product_id: string;
      warehouse_id: string;
      quantity: number;
    }>;
  }>
): Map<string, number> {
  const soldMap = new Map<string, number>();
  for (const n of soldNegocios) {
    const orderId = n.remission_id || n.source_delivery_order_id;
    if (!orderId) continue;
    for (const item of n.negocio_items || []) {
      const key = deliveryOrderAvailabilityKey(
        orderId,
        item.product_id,
        item.warehouse_id
      );
      soldMap.set(key, (soldMap.get(key) || 0) + Number(item.quantity));
    }
  }
  return soldMap;
}

type DeliveryOrderRelation<T> = T | T[] | null | undefined;

export function toDeliveryOrderOption(
  raw: {
    id: string;
    order_number: string | null;
    created_at: string;
    order_type: string;
    status: string;
    customer_id?: string | null;
    negocio_id?: string | null;
    customer?: DeliveryOrderRelation<{
      id?: string;
      name?: string | null;
      id_number?: string | null;
    }>;
    assigned_user?: DeliveryOrderRelation<{ full_name?: string | null }>;
    items?: DeliveryOrderRelation<{
      deleted_at?: string | null;
      product_id: string;
      warehouse_id: string;
      quantity: number;
      product?: DeliveryOrderRelation<{ name?: string | null; sale_price?: number | null }>;
      warehouse?: DeliveryOrderRelation<{ name?: string | null }>;
    }>;
  },
  soldMap: Map<string, number>
): DeliveryOrderOption | null {
  if (!isEligibleSourceDeliveryOrder(raw)) return null;

  const customer = unwrapOne(raw.customer);
  const assignedUser = unwrapOne(raw.assigned_user);
  const subtractSold = raw.order_type === 'remission';
  const items = unwrapMany(raw.items)
    .filter((i) => i && !i.deleted_at && i.product_id && i.warehouse_id)
    .map((i) => {
      const product = unwrapOne(i.product);
      const warehouse = unwrapOne(i.warehouse);
      const totalQty = Number(i.quantity) || 0;
      const sold = subtractSold
        ? soldMap.get(
            deliveryOrderAvailabilityKey(raw.id, i.product_id, i.warehouse_id)
          ) || 0
        : 0;
      return {
        product_id: i.product_id,
        product_name: product?.name || 'Producto',
        sale_price: Number(product?.sale_price) || 0,
        warehouse_id: i.warehouse_id,
        warehouse_name: warehouse?.name || 'Bodega',
        quantity: totalQty,
        available_quantity: Math.max(0, totalQty - sold),
      };
    })
    .filter((i) => i.available_quantity > 0);

  if (items.length === 0) return null;

  return {
    id: raw.id,
    order_number: raw.order_number || raw.id,
    created_at: raw.created_at,
    order_type: raw.order_type as DeliveryOrderOriginKind,
    status: raw.status,
    customer_id: raw.customer_id || customer?.id || null,
    customer_name: customer?.name || null,
    customer_id_number: customer?.id_number || null,
    assigned_user_name: assignedUser?.full_name || null,
    items,
  };
}

export function formatDeliveryOrderOptionLabel(order: DeliveryOrderOption): string {
  const typeLabel = order.order_type === 'remission' ? 'Remisión' : 'Cliente';
  const party =
    order.order_type === 'remission'
      ? order.assigned_user_name || 'sin asignar'
      : order.customer_name || 'sin cliente';
  return `#${order.order_number} · ${typeLabel} · ${party}`;
}

export async function fetchAvailableDeliveryOrders(): Promise<DeliveryOrderOption[]> {
  const { data: orders, error } = await supabase
    .from('delivery_orders')
    .select(`
      id,
      order_number,
      created_at,
      order_type,
      status,
      customer_id,
      negocio_id,
      customer:customers!fk_delivery_order_customer(id, name, id_number),
      assigned_user:profiles!fk_delivery_order_assigned_to_user(full_name),
      items:delivery_order_items!fk_delivery_order_item_order(
        id,
        product_id,
        warehouse_id,
        quantity,
        deleted_at,
        product:products(name, sale_price),
        warehouse:warehouses(name)
      )
    `)
    .in('order_type', ['remission', 'customer'])
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Error al obtener órdenes de entrega');
  }

  const remissionIds = (orders || [])
    .filter((o: { order_type: string }) => o.order_type === 'remission')
    .map((o: { id: string }) => o.id);

  let soldMap = new Map<string, number>();
  if (remissionIds.length > 0) {
    const { data: soldItems, error: soldItemsError } = await supabase
      .from('negocios')
      .select('remission_id, source_delivery_order_id, negocio_items(product_id, warehouse_id, quantity)')
      .in('remission_id', remissionIds)
      .is('deleted_at', null)
      .in('status', ['activo', 'entregado', 'cerrado']);

    if (soldItemsError) {
      const { data: fallbackSold, error: fallbackError } = await supabase
        .from('negocios')
        .select('remission_id, negocio_items(product_id, warehouse_id, quantity)')
        .in('remission_id', remissionIds)
        .is('deleted_at', null)
        .in('status', ['activo', 'entregado', 'cerrado']);

      if (fallbackError) {
        throw new Error(fallbackError.message || 'Error al calcular ventas de remisiones');
      }

      soldMap = mapSoldQuantities(fallbackSold || []);
    } else {
      soldMap = mapSoldQuantities(soldItems || []);
    }
  }

  return (orders || [])
    .map((row) => toDeliveryOrderOption(row as Parameters<typeof toDeliveryOrderOption>[0], soldMap))
    .filter((row): row is DeliveryOrderOption => row !== null);
}
