import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  createCustomerOffline,
  searchCustomersFromLocal,
} from '@/lib/offline/repositories/offlineRepository';

export type CustomerOption = {
  id: string;
  name: string;
  id_number: string;
};

export async function searchCustomersForNegocio(query: string): Promise<CustomerOption[]> {
  const term = query.trim();
  if (!term) return [];
  const pattern = `%${term}%`;
  try {
    const [byName, byDocument] = await Promise.all([
      supabase.from('customers').select('id, name, id_number').is('deleted_at', null).ilike('name', pattern).order('name').limit(20),
      supabase.from('customers').select('id, name, id_number').is('deleted_at', null).ilike('id_number', pattern).order('name').limit(20),
    ]);
    const error = byName.error || byDocument.error;
    if (error) throw error;
    const unique = new Map(
      [...(byName.data || []), ...(byDocument.data || [])].map((row) => [row.id, row as CustomerOption])
    );
    return [...unique.values()].slice(0, 20);
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    const local = await searchCustomersFromLocal(term, 20);
    return local.map((row) => ({
      id: row.id,
      name: row.name,
      id_number: row.idNumber || '',
    }));
  }
}

export async function createCustomer(input: {
  name: string;
  idNumber: string;
  phone: string | null;
}): Promise<CustomerOption> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: input.name,
        id_number: input.idNumber,
        phone: input.phone,
      })
      .select('id, name, id_number')
      .single();
    if (error) throw error;
    return data as CustomerOption;
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    return createCustomerOffline(input);
  }
}
