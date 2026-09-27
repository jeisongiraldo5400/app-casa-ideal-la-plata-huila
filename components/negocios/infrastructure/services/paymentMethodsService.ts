import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { fetchPaymentMethodsFromLocal } from '@/lib/offline/repositories/offlineRepository';

export type PaymentMethodOption = {
  id: string;
  name: string;
  /** El cobro con este método exige adjuntar el soporte (p. ej. consignación). */
  requiresSupport?: boolean;
};

/**
 * Métodos de pago vigentes. Sin red cae al catálogo descargado: la pantalla de
 * cobro exige elegir uno, así que la lista tiene que existir también offline.
 */
export async function fetchPaymentMethods(): Promise<PaymentMethodOption[]> {
  try {
    // `*` y no una lista de columnas: pedir `requires_support` antes de que
    // exista (migración 20261221120000) rompería el selector del cobro.
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return ((data || []) as { id: string; name: string; requires_support?: boolean | null }[]).map((row) => ({
      id: row.id,
      name: row.name,
      requiresSupport: row.requires_support === true,
    }));
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const local = await fetchPaymentMethodsFromLocal();
    if (!local) throw error;
    return local;
  }
}

/** ¿El método elegido exige adjuntar el soporte del pago? */
export function paymentMethodRequiresSupport(
  methods: readonly { id: string; requiresSupport?: boolean }[],
  methodId: string | null | undefined
): boolean {
  if (!methodId) return false;
  return methods.find((method) => method.id === methodId)?.requiresSupport === true;
}

/** Mensaje cuando falta el soporte obligatorio del método elegido. */
export function supportRequiredMessage(methodName?: string | null): string {
  const name = methodName?.trim();
  return name
    ? `El método de pago «${name}» exige adjuntar el soporte (foto o PDF del comprobante).`
    : 'Este método de pago exige adjuntar el soporte (foto o PDF del comprobante).';
}
