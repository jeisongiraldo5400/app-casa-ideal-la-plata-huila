import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import type { ProntoPagoRpcCall } from '@/lib/negocios/prontoPago';

/**
 * Acceso a datos del pronto pago y de la anulación de pagos. Todo es en línea:
 * ninguna de estas operaciones pasa por la cola offline.
 */

export type NegocioPagoPermissions = {
  canRegisterProntoPago: boolean;
  canVoidPago: boolean;
};

/**
 * Permisos del usuario sobre los pagos del negocio (admin o gestor de cobro
 * asignado). Un servidor sin la migración del pronto pago responde que la
 * función no existe: se trata como sin permiso y la acción no se muestra.
 * Los errores de red se propagan para que la pantalla use el permiso local.
 */
export async function fetchNegocioPagoPermissions(negocioId: string): Promise<NegocioPagoPermissions> {
  const [register, voidPago] = await Promise.all([
    supabase.rpc('can_register_negocio_pronto_pago', { p_negocio_id: negocioId }),
    supabase.rpc('can_void_negocio_pago', { p_negocio_id: negocioId }),
  ]);
  const networkError = [register.error, voidPago.error].find((error) => error && isNetworkError(error));
  if (networkError) throw networkError;
  return {
    canRegisterProntoPago: !register.error && register.data === true,
    canVoidPago: !voidPago.error && voidPago.data === true,
  };
}

export type ProntoPagoCuota = {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  late_fee_amount: number;
  status: string;
  deleted_at: string | null;
};

/**
 * Cuotas recién recalculadas para el pronto pago: primero aplica la mora del
 * día (igual que hará el RPC) y luego lee las cuotas vigentes.
 */
export async function fetchProntoPagoCuotas(negocioId: string): Promise<ProntoPagoCuota[]> {
  const { error: moraError } = await supabase.rpc('mark_cuotas_en_mora', { p_negocio_id: negocioId });
  if (moraError && !/sin permiso/i.test(moraError.message || '')) throw moraError;
  const { data, error } = await supabase
    .from('negocio_cuotas')
    .select('id, installment_number, due_date, amount, paid_amount, late_fee_amount, status, deleted_at')
    .eq('negocio_id', negocioId)
    .is('deleted_at', null)
    .order('due_date')
    .order('installment_number');
  if (error) throw error;
  return (data || []) as ProntoPagoCuota[];
}

/** Registra el pronto pago (detalle o parada de ruta) y devuelve el id del pago. */
export async function registerProntoPago(call: ProntoPagoRpcCall): Promise<string> {
  const { data, error } = await supabase.rpc(call.name, call.args as never);
  if (error) throw error;
  const pagoId = String(data || '');
  if (!pagoId) throw new Error('El servidor no devolvió el pago registrado');
  return pagoId;
}

export type RegisteredPagoReceipt = {
  virtual_receipt_number: string | null;
  receipt_number: string | null;
  paid_at: string | null;
  amount: number | null;
  discount_amount: number | null;
  expected_total: number | null;
  discount_reason: string | null;
};

/** Consecutivo y montos definitivos del pago recién registrado (para el ticket). */
export async function fetchRegisteredPagoReceipt(pagoId: string): Promise<RegisteredPagoReceipt | null> {
  const { data, error } = await supabase
    .from('negocio_pagos')
    .select('virtual_receipt_number, receipt_number, paid_at, amount, discount_amount, expected_total, discount_reason')
    .eq('id', pagoId)
    .maybeSingle();
  if (error) throw error;
  return (data as RegisteredPagoReceipt | null) ?? null;
}

/** Anula un pago con motivo (admin o gestor asignado; lo valida el servidor). */
export async function voidNegocioPago(pagoId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_negocio_pago', {
    p_pago_id: pagoId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}
