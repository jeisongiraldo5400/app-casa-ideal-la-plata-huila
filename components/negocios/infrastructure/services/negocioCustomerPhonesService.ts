import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { fetchNegocioCustomerPhonesFromLocal } from '@/lib/offline/repositories/offlineRepository';

export type NegocioCustomerPhones = { phone: string | null; phoneSecondary: string | null };

const NONE: NegocioCustomerPhones = { phone: null, phoneSecondary: null };

/**
 * Teléfonos del titular de un negocio, para mandarle el recibo en PDF por
 * WhatsApp desde Cartera › Cobros (la fila del cobro no los trae). Con señal
 * salen del servidor; sin señal o si falla, del teléfono. Nunca lanza: sin
 * teléfono el PDF sale por la hoja de compartir.
 */
export async function fetchNegocioCustomerPhones(negocioId: string): Promise<NegocioCustomerPhones> {
  const fromLocal = async () => (await fetchNegocioCustomerPhonesFromLocal(negocioId).catch(() => null)) ?? NONE;
  if (!useSyncStore.getState().online) return fromLocal();
  try {
    const { data: negocio, error } = await supabase
      .from('negocios')
      .select('customer_id')
      .eq('id', negocioId)
      .maybeSingle();
    if (error) throw error;
    if (!negocio?.customer_id) return fromLocal();
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('phone, phone_secondary')
      .eq('id', negocio.customer_id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return fromLocal();
    return { phone: customer.phone ?? null, phoneSecondary: customer.phone_secondary ?? null };
  } catch {
    return fromLocal();
  }
}
