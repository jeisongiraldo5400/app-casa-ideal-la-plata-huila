import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { fetchPaymentMethodsFromLocal } from '@/lib/offline/repositories/offlineRepository';

export type PaymentMethodOption = { id: string; name: string };

/**
 * Métodos de pago vigentes. Sin red cae al catálogo descargado: la pantalla de
 * cobro exige elegir uno, así que la lista tiene que existir también offline.
 */
export async function fetchPaymentMethods(): Promise<PaymentMethodOption[]> {
  try {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id, name')
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return (data || []) as PaymentMethodOption[];
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const local = await fetchPaymentMethodsFromLocal();
    if (!local) throw error;
    return local;
  }
}
