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

/** Ubicación del cliente: los tres niveles son opcionales. */
export type CustomerLocationInput = {
  address?: string | null;
  municipioId?: string | null;
  veredaId?: string | null;
};

export type CreateCustomerInput = CustomerLocationInput & {
  name: string;
  idNumber: string;
  phone: string | null;
  /**
   * Vendedor que el trigger `enforce_customer_seller` asignará (ver
   * `expectedSellerIdOnCreate`). Nunca se envía al servidor: solo sirve para el
   * reflejo local del alta sin conexión.
   */
  expectedSellerId?: string | null;
};

export type CreatedCustomer = CustomerOption & {
  /** Vendedor con el que quedó el cliente: el real si hubo red, el previsto si no. */
  seller_id: string | null;
  /** El alta quedó en la cola sin conexión. */
  saved_offline: boolean;
};

export async function createCustomer(input: CreateCustomerInput): Promise<CreatedCustomer> {
  const { expectedSellerId, ...customer } = input;
  try {
    // No se envía `seller_id`: lo decide el trigger según los roles de quien crea.
    const { data, error } = await supabase
      .from('customers')
      .insert({
        name: customer.name,
        id_number: customer.idNumber,
        phone: customer.phone,
        address: customer.address || null,
        municipio_id: customer.municipioId || null,
        vereda_id: customer.veredaId || null,
      })
      .select('id, name, id_number, seller_id')
      .single();
    if (error) throw error;
    const row = data as CustomerOption & { seller_id?: string | null };
    return {
      id: row.id,
      name: row.name,
      id_number: row.id_number,
      seller_id: row.seller_id ?? null,
      saved_offline: false,
    };
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    const sellerId = expectedSellerId ?? null;
    const created = await createCustomerOffline({ ...customer, sellerId });
    return { ...created, seller_id: sellerId, saved_offline: true };
  }
}
