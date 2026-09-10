import { supabase } from '@/lib/supabase';
import {
  SERIALS_NOT_ENABLED_MESSAGE,
  type CapturedSerial,
  type SerialAvailability,
  type SerialCaptureMethod,
} from '@/components/inventory-flow/serials';

export { MAX_SERIAL_LENGTH, normalizeSerial, type SerialAvailability } from '@/components/inventory-flow/serials';

export type ExitSerialCaptureMethod = SerialCaptureMethod;

/** Serial de fábrica capturado (opcionalmente) para una unidad de la salida. */
export type ExitSerial = CapturedSerial;

type CheckResult = { available?: boolean; message?: string; verified?: boolean } | null;

/**
 * Pregunta al servidor si el serial se puede despachar desde la bodega de la línea:
 * no está en otra salida activa ni registrado (en stock) en otra bodega. Además informa
 * si queda verificado (entró a esa bodega y sigue en stock).
 * Lanza si la consulta falla por red/servidor; el RPC de registro vuelve a validar al final.
 */
export async function checkExitSerialAvailability(
  deliveryOrderId: string,
  productId: string,
  serial: string,
  warehouseId: string
): Promise<SerialAvailability> {
  let { data, error } = await supabase.rpc('check_exit_serial', {
    p_delivery_order_id: deliveryOrderId,
    p_product_id: productId,
    p_serial: serial,
    p_warehouse_id: warehouseId,
  });

  // Servidor con seriales en salidas pero aún sin verificación por bodega: versión sin bodega.
  if (error?.code === 'PGRST202') {
    ({ data, error } = await supabase.rpc('check_exit_serial', {
      p_delivery_order_id: deliveryOrderId,
      p_product_id: productId,
      p_serial: serial,
    }));
  }

  if (error) {
    // Sin la migración el RPC de registro ignoraría los seriales: mejor no capturarlos.
    if (error.code === 'PGRST202') {
      return { available: false, message: SERIALS_NOT_ENABLED_MESSAGE };
    }
    throw error;
  }

  const result = data as CheckResult;
  if (result?.available === false) {
    return { available: false, message: result.message || 'Este serial ya salió en otra salida.' };
  }
  return { available: true, verified: typeof result?.verified === 'boolean' ? result.verified : undefined };
}
