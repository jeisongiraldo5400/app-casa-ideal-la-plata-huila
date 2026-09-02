import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { searchCustomerNegociosFromLocal } from '@/lib/offline/repositories/offlineRepository';

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

export type CustomerNegociosSearchResult = {
  customers: CustomerWithNegocios[];
  /** true cuando el resultado proviene de la base local (sin conexión). */
  fromCache: boolean;
};

export async function searchCustomerNegocios(
  search: string,
  limit = 20
): Promise<CustomerNegociosSearchResult> {
  const term = search.trim();
  if (term.length < 2) return { customers: [], fromCache: false };

  try {
    const { data, error } = await supabase.rpc('search_customer_negocios', {
      p_search: term,
      p_limit: limit,
    });

    if (error) throw new Error(error.message || 'No fue posible buscar clientes');

    const payload = data as { customers?: CustomerWithNegocios[] } | null;
    const customers = payload?.customers || [];

    return {
      customers: customers.map((customer) => ({
        ...customer,
        negocios: (customer.negocios || []).map((negocio) => ({
          ...negocio,
          total_credit: Number(negocio.total_credit || 0),
          remaining_balance: Number(negocio.remaining_balance || 0),
          negocio_numero: Number(negocio.negocio_numero || 0),
        })),
      })),
      fromCache: false,
    };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    // La búsqueda local no aplica el filtro de permisos del RPC
    // (can_manage_collection_for_negocio): la pantalla lo señala como datos locales.
    return { customers: await searchCustomerNegociosFromLocal(term, limit), fromCache: true };
  }
}

export function labelCustomerNegocioRole(role: CustomerNegocioRole | string) {
  if (role === 'codeudor') return 'Codeudor';
  if (role === 'titular_y_codeudor') return 'Titular y codeudor';
  return 'Titular';
}
