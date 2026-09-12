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

/**
 * Mapa de stock aparente desde las líneas de una orden o de un grupo de
 * origen de remisión (`RemissionOriginGroup`): ambos exponen `items`.
 */
export function stockMapFromDeliveryOrder(
  order: DeliveryOrderOption | RemissionOriginGroup | null
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

/**
 * El cliente de `lib/supabase.ts` se crea sin el genérico `Database`, así que
 * `rpc()` no infiere nada. Este envoltorio devuelve `unknown` en vez de `any`
 * para obligar al narrowing de `list_pending_remissions` y
 * `get_remission_origin_products` (ver `parse*Rows` más abajo).
 */
type UntypedRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const rpcUntyped = (fn: string, args?: Record<string, unknown>) =>
  (supabase as unknown as UntypedRpcClient).rpc(fn, args);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Remisión `pending` en la que se puede anidar la OE de un negocio nuevo. */
export interface PendingRemissionOption {
  id: string;
  order_number: string;
  assigned_to_user_id: string | null;
  assigned_user_name: string | null;
  zone_name: string | null;
  created_at: string;
  notes: string | null;
}

export function formatPendingRemissionLabel(remission: PendingRemissionOption): string {
  const parts = [remission.order_number, remission.assigned_user_name || 'sin asignar'];
  if (remission.zone_name) parts.push(remission.zone_name);
  return parts.join(' · ');
}

export function mapPendingRemissionRows(rows: unknown): PendingRemissionOption[] {
  if (!Array.isArray(rows)) return [];
  const result: PendingRemissionOption[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    const id = str(row?.id);
    if (!row || !id) continue;
    result.push({
      id,
      order_number: str(row.order_number) || id,
      assigned_to_user_id: str(row.assigned_to_user_id),
      assigned_user_name: str(row.assigned_user_name),
      zone_name: str(row.zone_name),
      created_at: str(row.created_at) || '',
      notes: str(row.notes),
    });
  }
  return result;
}

/** Remisiones `pending` (visibles para el vendedor vía SECURITY DEFINER). */
export async function fetchPendingRemissions(): Promise<PendingRemissionOption[]> {
  const { data, error } = await rpcUntyped('list_pending_remissions');
  if (error) {
    throw new Error(error.message || 'Error al cargar remisiones pendientes');
  }
  return mapPendingRemissionRows(data);
}

export type RemissionOriginGroupKind = 'own' | 'child';

/**
 * Grupo de productos que un negocio puede tomar de una remisión: el saldo
 * propio (`own`) o los productos de UNA OE de cliente anidada (`child`).
 * Un negocio nunca mezcla grupos.
 */
export interface RemissionOriginGroup {
  kind: RemissionOriginGroupKind;
  /** Remisión (own) u OE hija (child): es el `source_delivery_order_id` del negocio. */
  sourceOrderId: string;
  label: string;
  customerId: string | null;
  customerName: string | null;
  /** La OE hija ya tiene negocio: no se puede usar como origen. */
  hasNegocio: boolean;
  items: DeliveryOrderItemOption[];
}

/** Fila de `get_remission_origin_products`. */
export interface RemissionOriginRow {
  group_kind: RemissionOriginGroupKind;
  source_delivery_order_id: string | null;
  source_order_number: string | null;
  source_customer_id: string | null;
  source_customer_name: string | null;
  source_has_negocio: boolean;
  product_id: string;
  product_name: string;
  sale_price: number;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  available_quantity: number;
}

export const REMISSION_OWN_GROUP_LABEL = 'Productos propios de la remisión';

export function formatRemissionChildGroupLabel(
  orderNumber: string | null,
  customerName: string | null
): string {
  const order = orderNumber || 'OE';
  return customerName ? `Productos de la ${order} (${customerName})` : `Productos de la ${order}`;
}

/**
 * Agrupa las filas del RPC: propios primero y luego una entrada por OE hija
 * ordenada por número. Se descartan líneas sin saldo; el grupo propio sin
 * saldo se omite, pero una hija con negocio se conserva para mostrarla
 * deshabilitada («Ya tiene negocio asociado»).
 */
export function mapRemissionOriginRows(
  remissionId: string,
  rows: RemissionOriginRow[]
): RemissionOriginGroup[] {
  const own: RemissionOriginGroup = {
    kind: 'own',
    sourceOrderId: remissionId,
    label: REMISSION_OWN_GROUP_LABEL,
    customerId: null,
    customerName: null,
    hasNegocio: false,
    items: [],
  };
  const children = new Map<string, RemissionOriginGroup & { orderNumber: string }>();

  for (const row of rows) {
    const item: DeliveryOrderItemOption = {
      product_id: row.product_id,
      product_name: row.product_name || 'Producto',
      sale_price: num(row.sale_price),
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name || 'Bodega',
      quantity: num(row.quantity),
      available_quantity: Math.max(0, num(row.available_quantity)),
    };
    if (row.group_kind === 'own') {
      if (item.available_quantity > 0) own.items.push(item);
      continue;
    }
    const childId = row.source_delivery_order_id;
    if (!childId) continue;
    let group = children.get(childId);
    if (!group) {
      group = {
        kind: 'child',
        sourceOrderId: childId,
        orderNumber: row.source_order_number || '',
        label: formatRemissionChildGroupLabel(row.source_order_number, row.source_customer_name),
        customerId: row.source_customer_id,
        customerName: row.source_customer_name,
        hasNegocio: Boolean(row.source_has_negocio),
        items: [],
      };
      children.set(childId, group);
    }
    if (item.available_quantity > 0) group.items.push(item);
  }

  const childGroups = [...children.values()]
    .filter((group) => group.hasNegocio || group.items.length > 0)
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
    .map(({ orderNumber: _orderNumber, ...group }) => group);

  return own.items.length > 0 ? [own, ...childGroups] : childGroups;
}

export function parseRemissionOriginRows(rows: unknown): RemissionOriginRow[] {
  if (!Array.isArray(rows)) return [];
  const result: RemissionOriginRow[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    const productId = str(row?.product_id);
    const warehouseId = str(row?.warehouse_id);
    if (!row || !productId || !warehouseId) continue;
    result.push({
      group_kind: row.group_kind === 'child' ? 'child' : 'own',
      source_delivery_order_id: str(row.source_delivery_order_id),
      source_order_number: str(row.source_order_number),
      source_customer_id: str(row.source_customer_id),
      source_customer_name: str(row.source_customer_name),
      source_has_negocio: row.source_has_negocio === true,
      product_id: productId,
      product_name: str(row.product_name) || 'Producto',
      sale_price: num(row.sale_price),
      warehouse_id: warehouseId,
      warehouse_name: str(row.warehouse_name) || 'Bodega',
      quantity: num(row.quantity),
      available_quantity: num(row.available_quantity),
    });
  }
  return result;
}

/** Grupos de origen (propios / OE hijas) de una remisión elegida como origen del negocio. */
export async function fetchRemissionOriginProducts(
  remissionId: string
): Promise<RemissionOriginGroup[]> {
  const { data, error } = await rpcUntyped('get_remission_origin_products', {
    p_remission_id: remissionId,
  });
  if (error) {
    throw new Error(error.message || 'Error al cargar los productos de la remisión');
  }
  return mapRemissionOriginRows(remissionId, parseRemissionOriginRows(data));
}
