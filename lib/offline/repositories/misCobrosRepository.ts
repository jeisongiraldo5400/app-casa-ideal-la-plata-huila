import type { LocalMisCobro } from '@/lib/cartera/misCobros';
import { getDatabase } from '../database';
import { Customer, Negocio, NegocioCuota, NegocioPago, Profile } from '../models';
import { canUseLocalDb, loadDiscardedNegocioIds } from './offlineRepository';

/**
 * Pagos guardados en el teléfono para «Mis cobros» sin señal, con cliente,
 * negocio y cuota ya resueltos. `null` si no hay base local.
 *
 * Son los pagos de los negocios descargados más los registrados sin señal
 * (aún en la cola o rechazados). El filtro por cobrador lo hace
 * `filterLocalMisCobros`.
 */
export async function loadMisCobrosFromLocal(): Promise<LocalMisCobro[] | null> {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  const [allPagos, negocios, customers, cuotas, discarded] = await Promise.all([
    database.get<NegocioPago>('negocio_pagos').query().fetch(),
    database.get<Negocio>('negocios').query().fetch(),
    database.get<Customer>('customers').query().fetch(),
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    loadDiscardedNegocioIds(database),
  ]);
  // Igual que la lista de Negocios: nada de un negocio descartado por el usuario.
  const pagos = discarded.size ? allPagos.filter((pago) => !discarded.has(pago.negocioId)) : allPagos;
  const negocioById = new Map(negocios.map((row) => [row.id, row]));
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const installmentByCuota = new Map(cuotas.map((row) => [row.id, row.installmentNumber]));

  return pagos.map((pago) => {
    const negocio = negocioById.get(pago.negocioId);
    const customer = negocio ? customerById.get(negocio.customerId) : undefined;
    return {
      payment_id: pago.id,
      negocio_id: pago.negocioId,
      negocio_numero: negocio?.numero || 0,
      customer_name: customer?.name || 'Cliente',
      customer_id_number: customer?.idNumber || null,
      installment_number: pago.cuotaId ? installmentByCuota.get(pago.cuotaId) ?? null : null,
      paid_at: pago.paidAt,
      amount: Number(pago.amount || 0),
      virtual_receipt_number: pago.virtualReceiptNumber,
      receipt_number: pago.receiptNumber,
      receipt_status: pago.receiptStatus === 'anulado' ? 'anulado' : 'emitido',
      payment_method_id: pago.paymentMethodId ?? null,
      payment_method_name: pago.paymentMethodName ?? null,
      payment_site: pago.paymentSite ?? null,
      payment_kind: pago.paymentKind ?? null,
      created_by_name: pago.createdByName ?? null,
      sync_status: pago.rowSyncStatus || 'synced',
    };
  });
}

/** Nombre visible de un usuario descargado (misma convención que el servidor). */
export async function fetchProfileNameFromLocal(userId: string): Promise<string | null> {
  if (!canUseLocalDb()) return null;
  try {
    const row = await getDatabase().get<Profile>('profiles').find(userId);
    return row.fullName || row.email || null;
  } catch {
    return null;
  }
}

/** Pagos registrados en el teléfono que el servidor aún no confirma. */
export async function countUnsentPagosLocal(): Promise<number> {
  if (!canUseLocalDb()) return 0;
  const pagos = await getDatabase().get<NegocioPago>('negocio_pagos').query().fetch();
  return pagos.filter((pago) => pago.rowSyncStatus !== 'synced' && pago.rowSyncStatus !== 'rejected').length;
}
