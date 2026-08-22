import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

export type PendingDeliveryOrder =
  Database['public']['Functions']['get_my_authorized_delivery_orders']['Returns'][number];
export type RegisteredDeliveryOrder =
  Database['public']['Functions']['get_my_registered_delivery_orders']['Returns'][number];
export type RegisteredDeliveryOrderItem =
  Database['public']['Functions']['get_my_registered_delivery_order_items']['Returns'][number];

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

export async function fetchMyRegisteredDeliveryOrderItems(
  orderId: string,
): Promise<RegisteredDeliveryOrderItem[]> {
  const { data, error } = await supabase.rpc('get_my_registered_delivery_order_items', {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message || 'No fue posible cargar los productos registrados.');
  return data || [];
}
