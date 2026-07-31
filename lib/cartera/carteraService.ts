import { supabase } from '@/lib/supabase';

export type CarteraFilter = 'todas' | 'por_vencer' | 'vencidas' | 'mora';

export type CarteraRow = {
  cuota_id: string;
  negocio_id: string;
  negocio_numero: number;
  customer_name: string | null;
  customer_id_number: string | null;
  customer_phone: string | null;
  municipio_id: string | null;
  municipio_name: string | null;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  late_fee_amount: number;
  saldo: number;
  status: string;
  total_count: number;
};

export type Municipio = { id: string; nombre: string };
export type CollectionManager = { id: string; full_name: string };
export type ManagerBusiness = {
  negocio_id: string; negocio_numero: number; customer_name: string;
  customer_id_number: string | null; current_assignment: boolean; historical_assignment: boolean;
};
export type ManagerPayment = {
  payment_id: string; negocio_id: string; negocio_numero: number; customer_name: string;
  installment_number: number | null; paid_at: string; amount: number;
  virtual_receipt_number: string; receipt_number: string | null;
  receipt_status: 'emitido' | 'anulado'; created_by_name: string; remaining_balance: number;
  currently_assigned: boolean;
};

export type CarteraDashboard = {
  summary: Record<string, number | null>;
  aging: { label: string; balance: number; businesses: number; customers: number }[];
  managers: { gestor_cobro_id: string; manager_name: string; assigned_businesses: number; overdue_balance: number; collected_month: number; collection_compliance: number }[];
  municipalities: { municipality_id: string | null; municipality_name: string; active_businesses: number; overdue_balance: number; collected_month: number; overdue_rate: number }[];
  monthly: { month: string; expected: number; collected: number }[];
  alerts: Record<string, number>;
  critical_businesses: { id: string; numero: number; customer_name: string; overdue_balance: number; overdue_installments: number; overdue_days: number }[];
  customer_concentration: { customer_id: string; customer_name: string; balance: number }[];
};

export async function fetchCarteraPage(params: {
  filter: CarteraFilter; search: string; page: number; pageSize: number; days: number; municipioId: string;
}) {
  const { data, error } = await (supabase.rpc as any)('get_cartera_cuotas', {
    p_filter: params.filter, p_days: params.days, p_search: params.search,
    p_page: params.page, p_page_size: params.pageSize, p_municipio_id: params.municipioId || null,
  });
  if (error) throw new Error(error.message || 'No fue posible cargar la cartera');
  const rows = (data || []).map((row: any): CarteraRow => ({
    ...row, amount: Number(row.amount), paid_amount: Number(row.paid_amount),
    late_fee_amount: Number(row.late_fee_amount || 0), saldo: Number(row.saldo), total_count: Number(row.total_count || 0),
  }));
  return { rows, totalCount: rows[0]?.total_count || 0 };
}

export async function fetchCarteraDashboard(municipioId = '') {
  const { data, error } = await (supabase.rpc as any)('get_cartera_management_dashboard', {
    p_municipio_id: municipioId || null,
  });
  if (error) throw new Error(error.message || 'No fue posible cargar el resumen de cartera');
  return data as CarteraDashboard;
}

export async function fetchMunicipios() {
  const { data, error } = await supabase.from('municipios').select('id,nombre')
    .is('deleted_at', null).eq('is_active', true).order('nombre');
  if (error) throw new Error(error.message || 'No fue posible cargar municipios');
  return (data || []) as Municipio[];
}

export async function searchCollectionManagers(search: string) {
  const { data, error } = await (supabase.rpc as any)('search_collection_managers', { p_search: search, p_limit: 30 });
  if (error) throw new Error(error.message || 'No fue posible buscar gestores');
  return (data || []) as CollectionManager[];
}

export async function fetchManagerBusinesses(managerId: string, search = '') {
  const { data, error } = await (supabase.rpc as any)('get_collection_manager_businesses', {
    p_gestor_id: managerId, p_search: search, p_limit: 100,
  });
  if (error) throw new Error(error.message || 'No fue posible cargar negocios');
  return (data || []) as ManagerBusiness[];
}

export async function fetchManagerPayments(managerId: string, params: {
  scope: 'performed' | 'portfolio'; negocioId: string; dateFrom: string; dateTo: string;
  receiptStatus: 'todos' | 'emitido' | 'anulado'; search: string; page: number; pageSize: number;
}) {
  const { data, error } = await (supabase.rpc as any)('get_collection_manager_payments', {
    p_gestor_id: managerId, p_scope: params.scope, p_negocio_id: params.negocioId || null,
    p_date_from: params.dateFrom || null, p_date_to: params.dateTo || null,
    p_receipt_status: params.receiptStatus, p_search: params.search,
    p_page: params.page, p_page_size: params.pageSize,
  });
  if (error) throw new Error(error.message || 'No fue posible cargar cobros');
  return data as { summary: { total_count: number; valid_count: number; voided_count: number; total_collected: number; average_payment: number; last_payment_date: string | null }; rows: ManagerPayment[] };
}
