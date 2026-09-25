import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchCustomerFromLocal,
  fetchProfileNamesFromLocal,
} from '@/lib/offline/repositories/offlineRepository';

/**
 * Vendedor dueño del cliente (`customers.seller_id`). Desde 20261206120000 es
 * el «Vendedor» del negocio: al crear se muestra fijo junto a «Creado por» y,
 * si el cliente no tiene dueño, un administrador con señal puede asignarlo.
 *
 * - `assigned`: el cliente tiene vendedor; `name` es null si sin señal no se
 *   descargó su perfil.
 * - `unassigned`: el cliente no tiene vendedor.
 * - `unknown`: no se pudo saber (sin señal y el cliente no está en el teléfono,
 *   o un error): la pantalla no debe afirmar «Sin asignar».
 */
export type CustomerSellerLookup =
  | { status: 'assigned'; sellerId: string; name: string | null }
  | { status: 'unassigned' }
  | { status: 'unknown' };

const UNKNOWN: CustomerSellerLookup = { status: 'unknown' };

type SellerRow = {
  seller_id: string | null;
  seller: { full_name: string | null; email: string | null } | null;
};

export async function fetchCustomerSellerLookup(customerId: string): Promise<CustomerSellerLookup> {
  if (!customerId) return UNKNOWN;
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('seller_id, seller:profiles!customers_seller_id_fkey(full_name, email)')
      .eq('id', customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return UNKNOWN;
    const row = data as unknown as SellerRow;
    if (!row.seller_id) return { status: 'unassigned' };
    return {
      status: 'assigned',
      sellerId: row.seller_id,
      name: row.seller?.full_name || row.seller?.email || null,
    };
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) return UNKNOWN;
    return fetchCustomerSellerLookupFromLocal(customerId);
  }
}

/** Sin señal: el cliente y los perfiles descargados en el teléfono. */
async function fetchCustomerSellerLookupFromLocal(customerId: string): Promise<CustomerSellerLookup> {
  try {
    const [customer, profiles] = await Promise.all([
      fetchCustomerFromLocal(customerId),
      fetchProfileNamesFromLocal(),
    ]);
    if (!customer) return UNKNOWN;
    if (!customer.sellerId) return { status: 'unassigned' };
    return {
      status: 'assigned',
      sellerId: customer.sellerId,
      name: profiles.get(customer.sellerId) ?? null,
    };
  } catch {
    return UNKNOWN;
  }
}

/** Texto para «Vendedor (dueño del cliente): …». */
export function customerSellerLabel(lookup: CustomerSellerLookup | null): string {
  if (!lookup) return 'Cargando…';
  switch (lookup.status) {
    case 'assigned':
      return lookup.name || 'Asignado (nombre no disponible sin señal)';
    case 'unassigned':
      return 'Sin asignar';
    default:
      return 'No disponible';
  }
}
