// Servicio a servicio: `deliveryOrderQueries` es la única lectura de líneas de
// orden autorizada para quien sólo tiene la orden asignada (RPC
// `get_authorized_delivery_order_items`). Se importa por su ruta directa y no
// por `@/components/exits` para no arrastrar el store de salidas a este módulo.
import { fetchSelectableDeliveryOrderItems } from '@/components/exits/infrastructure/services/deliveryOrderQueries';
import { toDeliveryOrderItem } from '@/components/purchase-orders/domain/deliveryOrderItem';
import { DeliveryOrderItem } from '@/components/purchase-orders/types';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

export type PendingDeliveryOrder =
  Database['public']['Functions']['get_my_authorized_delivery_orders']['Returns'][number];
export type RegisteredDeliveryOrder =
  Database['public']['Functions']['get_my_registered_delivery_orders']['Returns'][number];
type RawRegisteredDeliveryOrderItem =
  Database['public']['Functions']['get_my_registered_delivery_order_items']['Returns'][number];

/**
 * Los tipos generados declaran no nulas todas las columnas de un RETURNS TABLE,
 * porque Postgres no expresa la nulabilidad de una función. Estas dos sí llegan
 * nulas: la observación de entrega es opcional y la de anulación viene de un
 * LEFT JOIN que solo tiene fila cuando la salida se canceló.
 */
export type RegisteredDeliveryOrderItem = Omit<
  RawRegisteredDeliveryOrderItem,
  'delivery_observations' | 'cancellation_observations'
> & {
  delivery_observations: string | null;
  cancellation_observations: string | null;
};

export interface RegisteredOrdersPage {
  orders: RegisteredDeliveryOrder[];
  totalCount: number;
  hasMore: boolean;
}

export async function fetchPendingDeliveryOrders(): Promise<PendingDeliveryOrder[]> {
  const { data, error } = await supabase.rpc('get_my_authorized_delivery_orders');
  if (error) throw new Error(error.message || 'No fue posible cargar las órdenes asignadas.');
  return data || [];
}

export async function fetchMyRegisteredDeliveryOrders({
  searchTerm,
  page,
  pageSize,
}: {
  searchTerm: string;
  page: number;
  pageSize: number;
}): Promise<RegisteredOrdersPage> {
  const { data, error } = await supabase.rpc('get_my_registered_delivery_orders', {
    p_search_term: searchTerm.trim() || null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw new Error(error.message || 'No fue posible cargar las órdenes registradas.');

  const orders = data || [];
  const totalCount = orders[0]?.total_count || 0;
  return {
    orders,
    totalCount,
    hasMore: page * pageSize < totalCount,
  };
}

/**
 * Productos de una orden asignada, con lo pedido, lo entregado y lo pendiente.
 * A diferencia de "Todas las órdenes", aquí el usuario no suele ser admin ni
 * bodeguero: la RLS de `delivery_order_items` le devolvería cero filas, así que
 * la lectura va por el RPC autorizado por asignación de recogida.
 */
export async function fetchAssignedDeliveryOrderItems(orderId: string): Promise<DeliveryOrderItem[]> {
  const { data, error } = await fetchSelectableDeliveryOrderItems(orderId);

  if (error) {
    throw new Error(
      /not authorized/i.test(error.message)
        ? 'Ya no tienes esta orden asignada, así que no puedes ver sus productos.'
        : error.message || 'No fue posible cargar los productos de la orden.',
    );
  }

  return data.map((row) =>
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
      source_delivery_order_id: row.source_delivery_order_id,
      source_order_number: row.source_order_number,
      source_customer_name: row.source_customer_name,
    }),
  );
}

export async function fetchMyRegisteredDeliveryOrderItems(
  orderId: string,
): Promise<RegisteredDeliveryOrderItem[]> {
  const { data, error } = await supabase.rpc('get_my_registered_delivery_order_items', {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message || 'No fue posible cargar los productos registrados.');
  return data || [];
}
