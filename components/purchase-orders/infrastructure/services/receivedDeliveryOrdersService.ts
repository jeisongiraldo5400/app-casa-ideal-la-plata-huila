import { fetchInChunks, IN_FILTER_PAGE_SIZE } from '@/lib/inChunks';
import { logHandledError } from '@/lib/errorMessage';
import { supabase } from '@/lib/supabase';
import { resolvedDeliveryQuantity } from '../../domain/deliveryOrderItem';
import { DeliveryOrder } from '../../types';
import {
  readReturnedQuantity,
  returnedQuantityGate,
  withReturnedQuantity,
} from './returnedQuantityColumn';

/**
 * «Órdenes recibidas» → pestaña de entrega: las órdenes que registró el propio
 * usuario y ya están cerradas o aprobadas.
 *
 * No usa `get_delivery_orders_page` (el RPC de «Todas las órdenes») a propósito:
 * esa función no sabe filtrar por `created_by`, solo acepta un estado a la vez
 * ('all' o uno) y topa en 50 filas, mientras que aquí hacen falta las 100
 * últimas de un usuario con tres estados. Además cuenta un producto como
 * entregado solo cuando está completo, y esta pantalla lo cuenta en cuanto
 * tiene una unidad resuelta. Se conserva, pues, el camino por tablas, pero sin
 * cascada: las dos primeras consultas salen a la vez y las líneas se piden en
 * lotes paralelos.
 */

/** Estados que la pantalla considera «completada o aprobada». */
export const RECEIVED_DELIVERY_ORDER_STATUSES = ['delivered', 'approved', 'received'];

/** Mismo tope que traía la pantalla. */
export const RECEIVED_DELIVERY_ORDERS_LIMIT = 100;

const ORDER_SELECT = `
  id,
  created_at,
  created_by,
  customer_id,
  assigned_to_user_id,
  order_type,
  delivery_address,
  notes,
  status,
  order_number,
  municipio_id,
  vereda_id,
  customer:customers(id, name, id_number),
  assigned_to_user:profiles(id, full_name, email),
  municipio:municipios(id, nombre, departamento_id, departamento:departamentos(id, nombre)),
  vereda:veredas(id, nombre)
`;

interface OrderRow {
  id: string;
  created_at: string;
  created_by: string | null;
  customer_id: string | null;
  assigned_to_user_id: string | null;
  order_type: string | null;
  delivery_address: string | null;
  notes: string | null;
  status: string | null;
  order_number: string | null;
  municipio_id: string | null;
  vereda_id: string | null;
  customer: { name: string | null; id_number: string | null } | null;
  assigned_to_user: { full_name: string | null; email: string | null } | null;
  municipio: {
    nombre: string | null;
    departamento_id: string | null;
    departamento: { nombre: string | null } | null;
  } | null;
  vereda: { nombre: string | null } | null;
}

/** `returned_quantity` falta mientras la migración de devoluciones no esté. */
interface ItemRow {
  delivery_order_id: string;
  quantity: number | null;
  delivered_quantity: number | null;
  returned_quantity?: number | null;
}

interface CreatorProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface OrderStats {
  total_items: number;
  total_quantity: number;
  delivered_items: number;
  delivered_quantity: number;
}

const EMPTY_STATS: OrderStats = {
  total_items: 0,
  total_quantity: 0,
  delivered_items: 0,
  delivered_quantity: 0,
};

/** Las órdenes cerradas del usuario, con sus totales ya sumados. */
export async function fetchReceivedDeliveryOrders(userId: string): Promise<DeliveryOrder[]> {
  // El listado está filtrado por `created_by = userId`, así que el único perfil
  // que hace falta se conoce antes de ver las órdenes: sale a la vez que ellas
  // en lugar de esperarlas. Las líneas sí dependen de qué órdenes hay, pero se
  // encadenan solo a esa consulta, no al perfil.
  const ordersPromise = fetchOrders(userId);
  const statsPromise = ordersPromise.then((orders) =>
    fetchStats(orders.map((order) => order.id)),
  );

  const [orders, creatorsById, statsByOrder] = await Promise.all([
    ordersPromise,
    fetchCreators([userId]),
    statsPromise,
  ]);

  return orders.map((order) => toDeliveryOrder(order, statsByOrder, creatorsById));
}

async function fetchOrders(userId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('delivery_orders')
    .select(ORDER_SELECT)
    .is('deleted_at', null)
    .eq('created_by', userId)
    .in('status', RECEIVED_DELIVERY_ORDER_STATUSES)
    .order('created_at', { ascending: false })
    .limit(RECEIVED_DELIVERY_ORDERS_LIMIT)
    .returns<OrderRow[]>();

  if (error) throw new Error(error.message || 'Error al cargar las órdenes de entrega completadas');
  return data || [];
}

async function fetchCreators(userIds: string[]): Promise<Map<string, CreatorProfile>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
    .returns<CreatorProfile[]>();
  return new Map((data || []).map((profile) => [profile.id, profile]));
}

/**
 * Suma los avances de todas las órdenes leyendo sus líneas. Los lotes salen en
 * paralelo (`fetchInChunks`); si fallan, la pantalla sigue viva con los totales
 * en cero, como hacía antes al fallar un lote.
 */
async function fetchStats(orderIds: string[]): Promise<Map<string, OrderStats>> {
  const statsByOrder = new Map<string, OrderStats>();
  if (orderIds.length === 0) return statsByOrder;

  let items: ItemRow[] = [];
  try {
    items = await returnedQuantityGate.run((withColumn) =>
      fetchInChunks(
        orderIds,
        (chunk) =>
          supabase
            .from('delivery_order_items')
            .select(withReturnedQuantity('delivery_order_id, quantity, delivered_quantity', withColumn))
            .in('delivery_order_id', chunk)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .returns<ItemRow[]>(),
        { pageSize: IN_FILTER_PAGE_SIZE },
      ),
    );
  } catch (error) {
    logHandledError('No se pudieron cargar las líneas de las órdenes de entrega', error);
    return statsByOrder;
  }

  items.forEach((item) => {
    const stats = statsByOrder.get(item.delivery_order_id) ?? { ...EMPTY_STATS };
    const quantity = item.quantity || 0;
    // Misma regla que el resto: lo devuelto ya salió de bodega y cuenta.
    const resolved = resolvedDeliveryQuantity(
      quantity,
      item.delivered_quantity || 0,
      readReturnedQuantity(item),
    );
    stats.total_items += 1;
    stats.total_quantity += quantity;
    if (resolved > 0) stats.delivered_items += 1;
    stats.delivered_quantity += resolved;
    statsByOrder.set(item.delivery_order_id, stats);
  });

  return statsByOrder;
}

function toDeliveryOrder(
  order: OrderRow,
  statsByOrder: Map<string, OrderStats>,
  creatorsById: Map<string, CreatorProfile>,
): DeliveryOrder {
  const stats = statsByOrder.get(order.id) ?? EMPTY_STATS;
  const creator = order.created_by ? creatorsById.get(order.created_by) : undefined;
  return {
    id: order.id,
    order_number: order.order_number,
    created_at: order.created_at,
    created_by: order.created_by ?? '',
    created_by_name: creator?.full_name || creator?.email || 'Usuario desconocido',
    customer_id: order.customer_id,
    customer_id_number: order.customer?.id_number ?? null,
    customer_name: order.customer?.name ?? null,
    customer_phone: null,
    customer_email: null,
    assigned_to_user_id: order.assigned_to_user_id,
    assigned_to_user_name: order.assigned_to_user?.full_name ?? null,
    assigned_to_user_email: order.assigned_to_user?.email ?? null,
    order_type: order.order_type ?? '',
    delivery_address: order.delivery_address,
    municipio_id: order.municipio_id ?? null,
    vereda_id: order.vereda_id ?? null,
    // El departamento no vive en la orden: se deduce del municipio.
    departamento_id: order.municipio?.departamento_id ?? null,
    departamento_name: order.municipio?.departamento?.nombre ?? null,
    municipio_name: order.municipio?.nombre ?? null,
    vereda_name: order.vereda?.nombre ?? null,
    notes: order.notes,
    status: order.status ?? '',
    total_items: stats.total_items,
    total_quantity: stats.total_quantity,
    delivered_items: stats.delivered_items,
    delivered_quantity: stats.delivered_quantity,
    items: [],
  };
}
