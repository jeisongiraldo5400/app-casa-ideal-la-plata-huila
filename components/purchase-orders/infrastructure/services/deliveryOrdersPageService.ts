import { fetchInChunks, IN_FILTER_PAGE_SIZE } from '@/lib/inChunks';
import { supabase } from '@/lib/supabase';
import { resolvedDeliveryQuantity } from '../../domain/deliveryOrderItem';
import {
  matchesDeliveryLocation,
  type DeliveryLocationFilter,
} from '../../domain/deliveryLocation';
import { DeliveryOrder } from '../../types';
import {
  readReturnedQuantity,
  returnedQuantityGate,
  withReturnedQuantity,
} from './returnedQuantityColumn';

/** Órdenes por página. El servidor topa en 50; la pantalla pide de 10 en 10. */
export const DELIVERY_ORDERS_PAGE_SIZE = 10;

/**
 * Tope del camino antiguo, que sigue vivo mientras la migración
 * `20261110120000_ordenes_moviles_paginacion` no esté aplicada. Es el mismo
 * número que traía la pantalla antes de paginar.
 */
const LEGACY_PAGE_LIMIT = 200;
const LEGACY_SEARCH_LIMIT = 100;

/** PostgREST cuando la función todavía no existe en la base. */
const FUNCTION_NOT_FOUND = 'PGRST202';

/** Posición estable en el listado: (created_at, id) de la última fila leída. */
export interface DeliveryOrdersCursor {
  createdAt: string;
  id: string;
}

export interface DeliveryOrdersPage {
  orders: DeliveryOrder[];
  hasMore: boolean;
  cursor: DeliveryOrdersCursor | null;
  /** `false` con el camino antiguo: no hay más páginas que pedir. */
  serverPaginated: boolean;
}

export interface FetchDeliveryOrdersPageParams {
  search: string;
  location: DeliveryLocationFilter;
  cursor: DeliveryOrdersCursor | null;
  pageSize?: number;
}

/** Fila de `get_delivery_orders_page`. El cliente de Supabase no lleva genérico. */
interface DeliveryOrdersPageRow {
  id: string;
  order_number: string | null;
  order_type: string | null;
  status: string | null;
  notes: string | null;
  delivery_address: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_id_number: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  assigned_to_user_id: string | null;
  assigned_to_user_name: string | null;
  assigned_to_user_email: string | null;
  departamento_id: string | null;
  departamento_name: string | null;
  municipio_id: string | null;
  municipio_name: string | null;
  vereda_id: string | null;
  vereda_name: string | null;
  total_items: number | string | null;
  completed_items: number | string | null;
  total_quantity: number | string | null;
  delivered_quantity: number | string | null;
  returned_quantity: number | string | null;
  resolved_quantity: number | string | null;
  pending_quantity: number | string | null;
  has_more: boolean | null;
}

const num = (value: number | string | null | undefined): number => Number(value) || 0;

/**
 * La tarjeta mide el avance en unidades resueltas (entregadas + devueltas): una
 * unidad devuelta ya salió y volvió, así que la línea queda cerrada. Por eso el
 * `delivered_quantity` del listado es el `resolved_quantity` del servidor, la
 * misma regla que aplica `resolvedDeliveryQuantity()` línea a línea.
 */
function toDeliveryOrder(row: DeliveryOrdersPageRow): DeliveryOrder {
  return {
    id: row.id,
    order_number: row.order_number,
    created_at: row.created_at,
    created_by: row.created_by ?? '',
    created_by_name: row.created_by_name || 'Usuario desconocido',
    customer_id: row.customer_id,
    customer_id_number: row.customer_id_number,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    assigned_to_user_id: row.assigned_to_user_id,
    assigned_to_user_name: row.assigned_to_user_name,
    assigned_to_user_email: row.assigned_to_user_email,
    order_type: row.order_type ?? '',
    delivery_address: row.delivery_address,
    municipio_id: row.municipio_id,
    vereda_id: row.vereda_id,
    departamento_id: row.departamento_id,
    departamento_name: row.departamento_name,
    municipio_name: row.municipio_name,
    vereda_name: row.vereda_name,
    notes: row.notes,
    status: row.status ?? '',
    total_items: num(row.total_items),
    total_quantity: num(row.total_quantity),
    delivered_items: num(row.completed_items),
    delivered_quantity: num(row.resolved_quantity),
    items: [],
  };
}

/**
 * Una página de «Todas las órdenes».
 *
 * El trabajo pesado lo hace `get_delivery_orders_page`: busca, filtra, pagina
 * por cursor y devuelve los totales de cada orden ya sumados, así que el
 * teléfono recibe 10 órdenes en vez de 200 con todas sus líneas. Mientras la
 * migración no esté aplicada (PGRST202) se usa el camino anterior, que sigue
 * funcionando para quien la RLS deja leer.
 */
export async function fetchDeliveryOrdersPage(
  params: FetchDeliveryOrdersPageParams,
): Promise<DeliveryOrdersPage> {
  const pageSize = params.pageSize || DELIVERY_ORDERS_PAGE_SIZE;
  const { data, error } = await supabase.rpc('get_delivery_orders_page', {
    p_search: params.search.trim() || null,
    p_status: 'all',
    p_order_type: 'all',
    p_departamento_id: params.location.departamentoId || null,
    p_municipio_id: params.location.municipioId || null,
    p_vereda_id: params.location.veredaId || null,
    p_limit: pageSize,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
  });

  if (error) {
    if (error.code !== FUNCTION_NOT_FOUND) {
      throw new Error(error.message || 'No fue posible cargar las órdenes de entrega.');
    }
    return fetchDeliveryOrdersLegacy(params);
  }

  const rows: DeliveryOrdersPageRow[] = Array.isArray(data) ? data : [];
  const last = rows[rows.length - 1];
  return {
    orders: rows.map(toDeliveryOrder),
    hasMore: Boolean(last?.has_more),
    cursor: last ? { createdAt: last.created_at, id: last.id } : params.cursor,
    serverPaginated: true,
  };
}

// ---------------------------------------------------------------------------
// Camino antiguo (sin la migración): una sola página con las últimas órdenes
// ---------------------------------------------------------------------------

const LEGACY_ORDER_SELECT = `
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
  customer:customers(id, name, id_number, phone, email),
  assigned_to_user:profiles(id, full_name, email),
  municipio:municipios(id, nombre, departamento_id, departamento:departamentos(id, nombre)),
  vereda:veredas(id, nombre)
`;

interface LegacyOrderRow {
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
  customer: { name: string | null; id_number: string | null; phone: string | null; email: string | null } | null;
  assigned_to_user: { full_name: string | null; email: string | null } | null;
  municipio: { nombre: string | null; departamento_id: string | null; departamento: { nombre: string | null } | null } | null;
  vereda: { nombre: string | null } | null;
}

/** `returned_quantity` falta mientras la migración de devoluciones no esté. */
interface LegacyItemRow {
  delivery_order_id: string;
  quantity: number | null;
  delivered_quantity: number | null;
  returned_quantity?: number | null;
}

interface LegacyStats {
  total_items: number;
  total_quantity: number;
  delivered_items: number;
  delivered_quantity: number;
}

async function fetchDeliveryOrdersLegacy(
  params: FetchDeliveryOrdersPageParams,
): Promise<DeliveryOrdersPage> {
  // El camino antiguo no pagina: si ya hay cursor es que se pidió «cargar más»
  // sobre una base sin la migración, y no hay nada más que traer.
  if (params.cursor) {
    return { orders: [], hasMore: false, cursor: params.cursor, serverPaginated: false };
  }

  const term = params.search.trim();
  const rows = term ? await fetchLegacySearchRows(term) : await fetchLegacyRecentRows();
  const orders = await buildLegacyOrders(rows);

  return {
    orders: orders.filter((order) => matchesDeliveryLocation(order, params.location)),
    hasMore: false,
    cursor: null,
    serverPaginated: false,
  };
}

async function fetchLegacyRecentRows(): Promise<LegacyOrderRow[]> {
  const { data, error } = await supabase
    .from('delivery_orders')
    .select(LEGACY_ORDER_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LEGACY_PAGE_LIMIT)
    .returns<LegacyOrderRow[]>();

  if (error) throw new Error(error.message || 'No fue posible cargar las órdenes de entrega.');
  return data || [];
}

async function fetchLegacySearchRows(term: string): Promise<LegacyOrderRow[]> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('get_delivery_orders_admin_list', {
    search_term: term,
    page: 1,
    page_size: LEGACY_SEARCH_LIMIT,
  });

  if (rpcError) throw new Error(rpcError.message || 'No fue posible buscar las órdenes de entrega.');

  const ids = (Array.isArray(rpcRows) ? rpcRows : []).map((row: { id: string }) => row.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('delivery_orders')
    .select(LEGACY_ORDER_SELECT)
    .in('id', ids)
    .is('deleted_at', null)
    .returns<LegacyOrderRow[]>();

  if (error) throw new Error(error.message || 'No fue posible cargar las órdenes encontradas.');

  // El RPC ya devolvió el orden bueno; la consulta por id lo pierde.
  const byId = new Map((data || []).map((row) => [row.id, row]));
  return ids.map((id: string) => byId.get(id)).filter((row): row is LegacyOrderRow => Boolean(row));
}

/**
 * Suma los avances leyendo las líneas de todas las órdenes traídas. Es justo el
 * trabajo que el RPC nuevo hace en SQL; aquí se conserva solo como red de
 * seguridad mientras la migración no esté aplicada.
 */
async function buildLegacyOrders(rows: LegacyOrderRow[]): Promise<DeliveryOrder[]> {
  if (!rows.length) return [];

  const creatorIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))] as string[];
  let creatorsById = new Map<string, { full_name: string | null; email: string | null }>();
  if (creatorIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', creatorIds);
    creatorsById = new Map((data || []).map((profile) => [profile.id, profile]));
  }

  const orderIds = rows.map((row) => row.id);
  const items: LegacyItemRow[] = await returnedQuantityGate.run((withColumn) =>
    fetchInChunks(
      orderIds,
      (chunk) =>
        supabase
          .from('delivery_order_items')
          .select(withReturnedQuantity('delivery_order_id, quantity, delivered_quantity', withColumn))
          .in('delivery_order_id', chunk)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .returns<LegacyItemRow[]>(),
      { pageSize: IN_FILTER_PAGE_SIZE },
    ),
  );

  const statsByOrder = new Map<string, LegacyStats>();
  items.forEach((item) => {
    const stats = statsByOrder.get(item.delivery_order_id) ?? {
      total_items: 0,
      total_quantity: 0,
      delivered_items: 0,
      delivered_quantity: 0,
    };
    const quantity = item.quantity || 0;
    const resolved = resolvedDeliveryQuantity(
      quantity,
      item.delivered_quantity || 0,
      readReturnedQuantity(item),
    );
    stats.total_items += 1;
    stats.total_quantity += quantity;
    stats.delivered_quantity += resolved;
    if (quantity > 0 && resolved >= quantity) stats.delivered_items += 1;
    statsByOrder.set(item.delivery_order_id, stats);
  });

  return rows.map((row) => {
    const stats = statsByOrder.get(row.id);
    const creator = row.created_by ? creatorsById.get(row.created_by) : undefined;
    return {
      id: row.id,
      order_number: row.order_number,
      created_at: row.created_at,
      created_by: row.created_by ?? '',
      created_by_name: creator?.full_name || creator?.email || 'Usuario desconocido',
      customer_id: row.customer_id,
      customer_id_number: row.customer?.id_number ?? null,
      customer_name: row.customer?.name ?? null,
      customer_phone: row.customer?.phone ?? null,
      customer_email: row.customer?.email ?? null,
      assigned_to_user_id: row.assigned_to_user_id,
      assigned_to_user_name: row.assigned_to_user?.full_name ?? null,
      assigned_to_user_email: row.assigned_to_user?.email ?? null,
      order_type: row.order_type ?? '',
      delivery_address: row.delivery_address,
      municipio_id: row.municipio_id,
      vereda_id: row.vereda_id,
      // El departamento no vive en la orden: se deduce del municipio.
      departamento_id: row.municipio?.departamento_id ?? null,
      departamento_name: row.municipio?.departamento?.nombre ?? null,
      municipio_name: row.municipio?.nombre ?? null,
      vereda_name: row.vereda?.nombre ?? null,
      notes: row.notes,
      status: row.status ?? '',
      total_items: stats?.total_items ?? 0,
      total_quantity: stats?.total_quantity ?? 0,
      delivered_items: stats?.delivered_items ?? 0,
      delivered_quantity: stats?.delivered_quantity ?? 0,
      items: [],
    };
  });
}
