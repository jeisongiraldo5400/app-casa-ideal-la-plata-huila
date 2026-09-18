import { buildRegisteredTotalsByKey } from '@/components/exits/infrastructure/utils/fifoDeliveryAllocation';
import { compositeKey } from '@/components/exits/infrastructure/utils/compositeKey';
// Servicio a servicio: la compuerta y la regla de "resuelto" viven en órdenes de
// entrega y las comparten todas las pantallas; se importan por su ruta directa
// para no arrastrar más módulo del necesario.
import { pendingDeliveryQuantity, resolvedDeliveryQuantity } from '@/components/purchase-orders/domain/deliveryOrderItem';
import {
  readReturnedQuantity,
  returnedQuantityGate,
  withReturnedQuantity,
} from '@/components/purchase-orders/infrastructure/services/returnedQuantityColumn';
import { fetchInChunks, IN_FILTER_PAGE_SIZE } from '@/lib/inChunks';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];
type DeliveryOrderRow = Database['public']['Tables']['delivery_orders']['Row'];

export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/** Mensaje de un error de supabase-js (objeto con `message`, no siempre instancia de Error). */
function queryErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return fallback;
}

/** Línea de orden con producto y bodega resueltos (RPC autorizado o consulta RLS). */
export type DeliveryOrderItemQueryRow = Pick<
  Database['public']['Tables']['delivery_order_items']['Row'],
  'id' | 'product_id' | 'warehouse_id' | 'quantity' | 'delivered_quantity' | 'created_at' | 'deleted_at' | 'source_delivery_order_id'
> & {
  /** Opcional: la columna existe desde la migración de notas por producto. */
  notes?: string | null;
  /** Opcional: la columna llega con la migración de devoluciones. 0 si falta. */
  returned_quantity?: number | null;
  /** Solo en copias de OE hijas dentro de una remisión (migración de remisiones mixtas). */
  source_order_number?: string | null;
  source_customer_name?: string | null;
  source_order_status?: string | null;
  product: Pick<Product, 'id' | 'name' | 'barcode' | 'sku' | 'deleted_at'> | null;
  warehouse: Pick<Warehouse, 'id' | 'name'> | null;
};

/**
 * Fila del RPC autorizado. Las columnas de la OE fuente se tipan aquí como opcionales
 * para compilar tanto antes como después de que `database.types.ts` las incorpore.
 */
type AuthorizedItemRow = Database['public']['Functions']['get_authorized_delivery_order_items']['Returns'][number] & {
  source_order_number?: string | null;
  source_customer_name?: string | null;
  source_order_status?: string | null;
  returned_quantity?: number | null;
};

/**
 * Fila de la consulta de respaldo con RLS. Se declara a mano porque el `select`
 * ya no es una cadena literal: lleva `returned_quantity` solo si la base la tiene.
 */
type DeliveryOrderItemDetailRow = Pick<
  Database['public']['Tables']['delivery_order_items']['Row'],
  'id' | 'product_id' | 'warehouse_id' | 'quantity' | 'delivered_quantity' | 'created_at' | 'deleted_at' | 'source_delivery_order_id'
> & {
  notes?: string | null;
  returned_quantity?: number | null;
};

const DELIVERY_ORDER_ITEM_DETAIL_SELECT = `
  id,
  product_id,
  warehouse_id,
  quantity,
  delivered_quantity,
  created_at,
  deleted_at,
  source_delivery_order_id,
  notes
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
      data: (Array.isArray(rpcResult.data) ? rpcResult.data : []).map((item: AuthorizedItemRow) => ({
        id: item.id,
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        quantity: item.quantity,
        delivered_quantity: item.delivered_quantity,
        returned_quantity: readReturnedQuantity(item),
        created_at: item.created_at,
        deleted_at: null,
        source_delivery_order_id: item.source_delivery_order_id ?? null,
        source_order_number: item.source_order_number ?? null,
        source_customer_name: item.source_customer_name ?? null,
        source_order_status: item.source_order_status ?? null,
        notes: item.notes ?? null,
        product: { id: item.product_id, name: item.product_name, barcode: item.product_barcode, sku: item.product_sku, deleted_at: null },
        warehouse: { id: item.warehouse_id, name: item.warehouse_name },
      })),
      error: null,
    };
  }

  if (rpcResult.error.code !== 'PGRST202') {
    return { data: [], error: rpcResult.error };
  }

  const readItemsBy = (column: 'delivery_order_id' | 'source_delivery_order_id') =>
    returnedQuantityGate.run((withColumn) =>
      supabase
        .from('delivery_order_items')
        .select(withReturnedQuantity(DELIVERY_ORDER_ITEM_DETAIL_SELECT, withColumn))
        .eq(column, orderId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .returns<DeliveryOrderItemDetailRow[]>(),
    );

  let itemResult = await readItemsBy('delivery_order_id');
  if (itemResult.error) return { data: [], error: itemResult.error };

  if (!itemResult.data?.length) {
    // Algunas órdenes de cliente llegan copiadas dentro de una remisión: la clave confiable es source_delivery_order_id.
    itemResult = await readItemsBy('source_delivery_order_id');
    if (itemResult.error) return { data: [], error: itemResult.error };
  }

  const rawItems = itemResult.data || [];
  if (rawItems.length === 0) return { data: [], error: null };

  // Cargar catálogos por separado: un join !inner vacío eliminaba toda la respuesta.
  const productIds = [...new Set(rawItems.map((item) => item.product_id))];
  const warehouseIds = [...new Set(rawItems.map((item) => item.warehouse_id))];
  // En lotes: una remisión grande puede traer cientos de productos distintos.
  let products: Pick<Product, 'id' | 'name' | 'barcode' | 'sku' | 'deleted_at'>[];
  let warehouses: Pick<Warehouse, 'id' | 'name'>[];
  try {
    [products, warehouses] = await Promise.all([
      fetchInChunks(productIds, (chunk) =>
        supabase.from('products').select('id, name, barcode, sku, deleted_at').in('id', chunk).is('deleted_at', null)
      ),
      fetchInChunks(warehouseIds, (chunk) => supabase.from('warehouses').select('id, name').in('id', chunk)),
    ]);
  } catch (catalogError: unknown) {
    return { data: [], error: { message: queryErrorMessage(catalogError, 'No fue posible cargar los productos de la orden') } };
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

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
  // En lotes (URL corta) y por páginas: cada orden puede tener varias salidas.
  return fetchInChunks(
    orderIds,
    (chunk) =>
      supabase
        .from('inventory_exits')
        .select('id, delivery_order_id, product_id, warehouse_id, quantity')
        .in('delivery_order_id', chunk)
        .order('id', { ascending: true }),
    { pageSize: IN_FILTER_PAGE_SIZE }
  );
}

/**
 * IDs de salidas con cancelación activa. Lanza si la consulta falla: devolver un set vacío
 * contaría salidas canceladas como entregadas y ocultaría pendientes.
 */
export async function getActiveCancelledExitIds(exitIds: string[]): Promise<Set<string>> {
  if (exitIds.length === 0) return new Set();
  try {
    // Un usuario con remisiones históricas acumula miles de salidas: sin lotes la URL
    // superaba el límite y PostgREST respondía 400 «Bad Request».
    const data = await fetchInChunks(exitIds, (chunk) =>
      supabase
        .from('inventory_exit_cancellations')
        .select('inventory_exit_id')
        .in('inventory_exit_id', chunk)
        .is('deleted_at', null)
    );
    return new Set(data.map((cancellation) => cancellation.inventory_exit_id));
  } catch (error: unknown) {
    throw new Error(`No fue posible verificar las salidas canceladas: ${queryErrorMessage(error, 'error desconocido')}`);
  }
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

type DeliveredTotalsRow = {
  delivery_order_id: string;
  quantity: number | null;
  delivered_quantity: number | null;
  returned_quantity?: number | null;
};

/**
 * Unidades resueltas por orden (entregado + devuelto, con tope en lo pedido de cada
 * línea). Es la fuente de verdad en BD. Lanza si la consulta falla.
 */
export async function fetchDeliveredTotalsByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (orderIds.length === 0) return totals;
  const data = await returnedQuantityGate.run((withColumn) =>
    fetchInChunks(
      orderIds,
      (chunk) =>
        supabase
          .from('delivery_order_items')
          .select(withReturnedQuantity('delivery_order_id, quantity, delivered_quantity', withColumn))
          .in('delivery_order_id', chunk)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .returns<DeliveredTotalsRow[]>(),
      { pageSize: IN_FILTER_PAGE_SIZE }
    )
  );
  data.forEach((item) => {
    const resolved = resolvedDeliveryQuantity(
      Number(item.quantity) || 0,
      Number(item.delivered_quantity) || 0,
      readReturnedQuantity(item)
    );
    totals.set(item.delivery_order_id, (totals.get(item.delivery_order_id) || 0) + resolved);
  });
  return totals;
}

export type CustomerOrderItemRow = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  delivered_quantity: number | null;
  /** Ausente mientras la migración de devoluciones no esté aplicada. */
  returned_quantity?: number | null;
  deleted_at: string | null;
  product: Pick<Product, 'id' | 'name' | 'barcode' | 'sku' | 'deleted_at'> | null;
};

export type CustomerOrderRow = DeliveryOrderRow & { items: CustomerOrderItemRow[] };

/** Órdenes pendientes de un cliente con sus líneas activas. Lanza si la consulta falla. */
export async function fetchPendingCustomerOrders(customerId: string): Promise<CustomerOrderRow[]> {
  const { data, error } = await returnedQuantityGate.run((withColumn) =>
    supabase
      .from('delivery_orders')
      .select(
        `
      *,
      items:delivery_order_items!fk_delivery_order_item_order!inner(
        id,
        product_id,
        warehouse_id,
        quantity,
        delivered_quantity,${withColumn ? '\n        returned_quantity,' : ''}
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
      .limit(50)
  );
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

/** Orden real contra la que se registran las salidas de una línea (la OE hija para las copias). */
export function targetOrderIdOfLine(orderId: string, line: Pick<DeliveryOrderItemQueryRow, 'source_delivery_order_id'>): string {
  return line.source_delivery_order_id || orderId;
}

/** Ids de orden que reciben salidas de la orden seleccionada: ella misma y sus OE hijas. */
export function targetOrderIdsOf(orderId: string, lines: Pick<DeliveryOrderItemQueryRow, 'source_delivery_order_id'>[]): string[] {
  const ids = new Set<string>([orderId]);
  lines.forEach((line) => ids.add(targetOrderIdOfLine(orderId, line)));
  return [...ids];
}

/**
 * Totales registrados (producto+bodega) por orden objetivo, a partir de las líneas activas
 * de la orden seleccionada y las salidas no canceladas de cada orden objetivo. Cada slot
 * se construye solo con las líneas de su grupo (ver `buildRegisteredTotalsByKey`).
 */
export function buildRegisteredTotalsByOrder(
  orderId: string,
  lines: DeliveryOrderItemQueryRow[],
  exitsByOrder: Map<string, Map<string, number>>
): Record<string, Record<string, number>> {
  const byOrder: Record<string, Record<string, number>> = {};
  targetOrderIdsOf(orderId, lines).forEach((targetId) => {
    const groupLines = lines
      .filter((line) => targetOrderIdOfLine(orderId, line) === targetId)
      .map((line) => ({
        id: line.id,
        product_id: line.product_id,
        warehouse_id: line.warehouse_id,
        quantity: Number(line.quantity) || 0,
        db_delivered_quantity: Number(line.delivered_quantity) || 0,
        db_returned_quantity: readReturnedQuantity(line),
        created_at: line.created_at || EPOCH_ISO,
      }));
    const totals = buildRegisteredTotalsByKey(groupLines, Object.fromEntries(exitsByOrder.get(targetId) || []));
    Object.keys(totals).forEach((k) => {
      if (totals[k] <= 0) delete totals[k];
    });
    byOrder[targetId] = totals;
  });
  return byOrder;
}

/**
 * Re-lee las líneas autorizadas de la orden seleccionada (propias y copias de OE hijas) y las
 * salidas de todas sus órdenes objetivo; devuelve los totales por orden y si quedó completa.
 * Usado tras registrar una salida. Usa el RPC autorizado porque la RLS de tabla puede no
 * dejar leer la OE hija a quien solo tiene asignada la remisión.
 */
export async function loadRegisteredTotalsForSelectedOrder(
  orderId: string
): Promise<{ totalsByOrder: Record<string, Record<string, number>>; completed: boolean } | null> {
  const { data: lines, error } = await fetchSelectableDeliveryOrderItems(orderId);
  if (error) throw new Error(error.message);
  const activeLines = lines.filter((line) => !line.deleted_at && line.product && !line.product.deleted_at);
  if (activeLines.length === 0) return null;

  const targetIds = targetOrderIdsOf(orderId, activeLines);
  const exits = await fetchInventoryExitsForOrders(targetIds);
  const cancelledExitIds = await getActiveCancelledExitIds(exits.map((exit) => exit.id));
  const exitsByOrder = groupExitsByOrder(exits, cancelledExitIds);

  const totalsByOrder = buildRegisteredTotalsByOrder(orderId, activeLines, exitsByOrder);
  // Una línea queda cerrada cuando lo entregado más lo devuelto cubre lo pedido.
  const completed = activeLines.every(
    (line) =>
      pendingDeliveryQuantity(
        Number(line.quantity) || 0,
        Number(line.delivered_quantity) || 0,
        readReturnedQuantity(line)
      ) === 0
  );
  return { totalsByOrder, completed };
}
