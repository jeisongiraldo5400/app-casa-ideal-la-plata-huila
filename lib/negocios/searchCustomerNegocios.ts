import { supabase } from '@/lib/supabase';

export type CustomerNegocioRole = 'titular' | 'codeudor' | 'titular_y_codeudor';

export type CustomerNegocioItem = {
  negocio_id: string;
  negocio_numero: number;
  status: string;
  deal_date: string | null;
  total_credit: number;
  remaining_balance: number;
  direccion: string;
  municipio_name: string | null;
  role_in_negocio: CustomerNegocioRole;
};

export type CustomerWithNegocios = {
  customer_id: string;
  customer_name: string;
  customer_id_number: string | null;
  customer_phone: string | null;
  negocios: CustomerNegocioItem[];
};

export async function searchCustomerNegocios(
  search: string,
  limit = 20
): Promise<CustomerWithNegocios[]> {
  const term = search.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase.rpc('search_customer_negocios', {
    p_search: term,
    p_limit: limit,
  });

  if (error) {
    throw new Error(error.message || 'No fue posible buscar clientes');
  }

  const payload = data as { customers?: CustomerWithNegocios[] } | null;
  const customers = payload?.customers || [];

  return customers.map((customer) => ({
    ...customer,
    negocios: (customer.negocios || []).map((negocio) => ({
      ...negocio,
      total_credit: Number(negocio.total_credit || 0),
      remaining_balance: Number(negocio.remaining_balance || 0),
      negocio_numero: Number(negocio.negocio_numero || 0),
    })),
  }));
}

export function labelCustomerNegocioRole(role: CustomerNegocioRole | string) {
  if (role === 'codeudor') return 'Codeudor';
  if (role === 'titular_y_codeudor') return 'Titular y codeudor';
  return 'Titular';
}
