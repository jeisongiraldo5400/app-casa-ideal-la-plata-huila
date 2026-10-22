import { createIdempotencyKey } from '@/lib/idempotency';
import {
  parseDeliveryOrderPrintData,
  type DeliveryOrderPrintData,
  type DeliveryOrderPrintLayout,
} from '@/lib/deliveryOrderPrintHtml';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import type { PrintCopyInfo } from '@/lib/printCopy';
import { supabase } from '@/lib/supabase';

/**
 * Impresión de órdenes de entrega y remisiones (20261231580000).
 *
 * Sin señal NO se imprime: la foto local de órdenes (descarga selectiva) no
 * trae lo entregado, lo devuelto, los seriales ni los teléfonos del cliente, y
 * un papel con cantidades viejas es peor que ninguno. Por eso tampoco hay
 * número de copia offline ni cola: con red, el servidor registra y numera.
 */

export const DELIVERY_ORDER_PRINT_OFFLINE_MESSAGE =
  'Para imprimir la orden se necesita conexión: el documento lleva lo entregado y lo devuelto al día.';

export class DeliveryOrderPrintOfflineError extends Error {
  constructor() {
    super(DELIVERY_ORDER_PRINT_OFFLINE_MESSAGE);
    this.name = 'DeliveryOrderPrintOfflineError';
  }
}

function assertOnline() {
  if (!useSyncStore.getState().online) throw new DeliveryOrderPrintOfflineError();
}

function rethrow(error: unknown, fallback: string): never {
  if (isNetworkError(error)) throw new DeliveryOrderPrintOfflineError();
  const message = (error as { message?: string } | null)?.message;
  throw new Error(message || fallback);
}

export async function fetchDeliveryOrderPrintData(orderId: string): Promise<DeliveryOrderPrintData> {
  assertOnline();
  try {
    const { data, error } = await supabase.rpc('get_delivery_order_print_data' as never, {
      p_delivery_order_id: orderId,
    } as never);
    if (error) throw error;
    return parseDeliveryOrderPrintData(data);
  } catch (error) {
    rethrow(error, 'No se pudieron leer los datos de la orden');
  }
}

export type DeliveryOrderPrintRegistration = {
  copy: PrintCopyInfo | null;
  copiesByOrderId: Record<string, PrintCopyInfo>;
  printedAt: string;
};

/** Respuesta de `register_delivery_order_print`; lanza si no trae número de copia. */
export function parseDeliveryOrderPrintRegistration(data: unknown): DeliveryOrderPrintRegistration {
  const row = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const printedAt = typeof row.printed_at === 'string' ? row.printed_at : new Date().toISOString();
  const printedBy = typeof row.printed_by_name === 'string' ? row.printed_by_name : null;
  const copiesByOrderId: Record<string, PrintCopyInfo> = {};
  for (const raw of Array.isArray(row.copies) ? row.copies : []) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const number = Number(entry.copy_number);
    if (typeof entry.delivery_order_id === 'string' && Number.isFinite(number) && number >= 1) {
      copiesByOrderId[entry.delivery_order_id] = { number, printedAt, printedBy };
    }
  }
  const number = Number(row.copy_number);
  const copy = row.copy_number != null && Number.isFinite(number) && number >= 1 ? { number, printedAt, printedBy } : null;
  if (!copy && Object.keys(copiesByOrderId).length === 0) {
    throw new Error('El servidor no devolvió el número de copia');
  }
  return { copy, copiesByOrderId, printedAt };
}

/**
 * Registra la impresión (canal móvil) y devuelve el número de copia. Si no se
 * puede registrar no se imprime: el papel saldría sin la marca de copia.
 */
export async function registerDeliveryOrderPrint(
  orderId: string,
  layout: DeliveryOrderPrintLayout
): Promise<DeliveryOrderPrintRegistration> {
  assertOnline();
  try {
    const { data, error } = await supabase.rpc('register_delivery_order_print' as never, {
      p_delivery_order_id: orderId,
      p_channel: 'movil',
      p_layout: layout,
      p_format: 'pdf',
      // Un reintento de la misma llamada no crea otra copia.
      p_client_event_id: createIdempotencyKey(),
    } as never);
    if (error) throw error;
    return parseDeliveryOrderPrintRegistration(data);
  } catch (error) {
    rethrow(error, 'No se pudo registrar la impresión');
  }
}
