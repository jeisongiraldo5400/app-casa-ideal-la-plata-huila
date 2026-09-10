import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database.types';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  countMyCustomersLocal,
  fetchCustomerFromLocal,
  fetchCustomerNegociosFromLocal,
  fetchCustomersPageFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import {
  EMPTY_CARTERA,
  parseCustomerSummary,
  type CustomerSummary,
} from '@/lib/customers/customerSummary';

/** Pestañas del módulo: los clientes del vendedor o el directorio completo. */
export type CustomersTab = 'mios' | 'todos';

export type CustomerDirectoryRow = {
  id: string;
  name: string;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  municipio_name: string | null;
  vereda_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
};

export type CustomersPage = {
  customers: CustomerDirectoryRow[];
  totalCount: number;
  hasMore: boolean;
  fromCache: boolean;
};

export const CUSTOMERS_PAGE_SIZE = 20;

type DashboardRow = Database['public']['Functions']['get_customers_dashboard']['Returns'][number];

type FetchCustomersParams = {
  tab: CustomersTab;
  sellerId: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Filtro por vendedor en la pestaña «Todos»; se ignora en «Mis clientes». */
  filterSellerId?: string | null;
};

/**
 * `get_customers_dashboard` devuelve también `total_exits` y `last_exit_date`,
 * pero no se mapean a propósito: la función no es SECURITY DEFINER y la RLS de
 * `inventory_exits` los deja en cero para un vendedor, así que mostrarlos sería
 * mentir.
 */
export async function fetchCustomersPage(params: FetchCustomersParams): Promise<CustomersPage> {
  const page = Math.max(params.page || 1, 1);
  const pageSize = Math.max(params.pageSize || CUSTOMERS_PAGE_SIZE, 1);
  const search = (params.search || '').trim();
  const scopedSellerId =
    params.tab === 'mios' ? params.sellerId : params.filterSellerId || null;

  try {
    const { data, error } = await supabase.rpc('get_customers_dashboard', {
      search_term: search,
      page,
      page_size: pageSize,
      seller_ids: scopedSellerId ? [scopedSellerId] : undefined,
      include_unassigned: false,
    });
    if (error) throw new Error(error.message || 'No fue posible cargar los clientes');

    const rows: DashboardRow[] = data || [];
    const totalCount = Number(rows[0]?.total_count || 0);
    return {
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        id_number: row.id_number ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        municipio_name: row.municipio_name ?? null,
        vereda_name: row.vereda_name ?? null,
        seller_id: row.seller_id ?? null,
        seller_name: row.seller_name ?? null,
      })),
      totalCount,
      hasMore: page * pageSize < totalCount,
      fromCache: false,
    };
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    const local = await fetchCustomersPageFromLocal({
      sellerId: scopedSellerId,
      search,
      page,
      pageSize,
    });
    return {
      customers: local.items.map((row) => ({
        id: row.id,
        name: row.name,
        id_number: row.idNumber,
        phone: row.phone,
        email: null,
        address: null,
        municipio_name: null,
        vereda_name: null,
        seller_id: row.sellerId,
        seller_name: null,
      })),
      totalCount: local.totalCount,
      hasMore: page * pageSize < local.totalCount,
      fromCache: true,
    };
  }
}

/** Conteo para el badge de la pestaña; una consulta de conteo, no un listado. */
export async function countMyCustomers(sellerId: string | null): Promise<number> {
  if (!sellerId) return 0;
  try {
    const { count, error } = await supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', sellerId)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    return count || 0;
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) return 0;
    return countMyCustomersLocal(sellerId);
  }
}

export async function fetchCustomerSummary(customerId: string): Promise<CustomerSummary & { fromCache: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_customer_summary', {
      p_customer_id: customerId,
    });
    if (error) throw new Error(error.message || 'No fue posible cargar el cliente');
    return { ...parseCustomerSummary(data), fromCache: false };
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    const [customer, negocios] = await Promise.all([
      fetchCustomerFromLocal(customerId),
      fetchCustomerNegociosFromLocal(customerId),
    ]);
    if (!customer) throw error;
    return {
      customer: {
        id: customer.id,
        name: customer.name,
        id_number: customer.idNumber,
        phone: customer.phone,
        email: null,
        address: null,
        notes: null,
        municipio_name: null,
        vereda_name: null,
        departamento_name: null,
        created_at: null,
        seller_id: customer.sellerId,
      },
      seller: null,
      negocios: negocios?.negocios || [],
      // Sin conexión no se calcula el resumen de cartera del cliente: la ficha
      // lo oculta en vez de mostrar ceros que parecerían "sin deuda".
      cartera: EMPTY_CARTERA,
      scope: { visible_negocios: negocios?.negocios.length || 0, hidden_negocios: 0 },
      fromCache: true,
    };
  }
}

/**
 * Reclama un cliente sin vendedor. El `.is('seller_id', null)` cierra la
 * carrera con otro vendedor: si alguien se adelantó no vuelve ninguna fila.
 * El trigger `enforce_customer_seller` aplica la misma regla en el servidor.
 */
export async function claimCustomer(customerId: string, sellerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('customers')
    .update({ seller_id: sellerId })
    .eq('id', customerId)
    .is('seller_id', null)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message || 'No fue posible asignarte el cliente');
  if (!data) throw new Error('Este cliente ya tiene vendedor asignado.');
}
