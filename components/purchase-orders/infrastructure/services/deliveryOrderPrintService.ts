import { parseDeliveryOrderPrintData, type DeliveryOrderPrintData } from '@/lib/deliveryOrderPrintHtml';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { supabase } from '@/lib/supabase';

/**
 * PDF de órdenes de entrega y remisiones (20261231580000).
 *
 * Sin señal NO se genera: la foto local de órdenes (descarga selectiva) no
 * trae lo entregado, lo devuelto, los seriales ni los teléfonos del cliente, y
 * un papel con cantidades viejas es peor que ninguno.
 *
 * El móvil no registra copias de la orden (decisión 2026-10-23): solo cuenta
 * lo impreso en papel, y aquí la orden solo se comparte como PDF. El conteo
 * («COPIA N.º X», delivery_order_print_events) lo lleva el botón «Imprimir»
 * de la web.
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
