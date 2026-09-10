import { supabase } from '@/lib/supabase';

export type ExitSerialCaptureMethod = 'scan' | 'manual';

/** Serial de fábrica capturado (opcionalmente) para una unidad de la salida. */
export interface ExitSerial {
  /** Tal como se escaneó o escribió, sin espacios al inicio/fin. */
  serial: string;
  /** Clave de comparación; misma regla que public.normalize_serial en BD. */
  normalized: string;
  method: ExitSerialCaptureMethod;
}

export const MAX_SERIAL_LENGTH = 100;

/** Solo letras y números, en mayúsculas: "ab-123 45" y "AB12345" son el mismo serial. */
export function normalizeSerial(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
}

export type SerialAvailability =
  | { available: true }
  | { available: false; message: string };

/**
 * Pregunta al servidor si el serial ya está en otra salida activa de la misma referencia.
 * Lanza si la consulta falla por red/servidor; el RPC de registro vuelve a validar al final.
 */
export async function checkExitSerialAvailability(
  deliveryOrderId: string,
  productId: string,
  serial: string
): Promise<SerialAvailability> {
  const { data, error } = await supabase.rpc('check_exit_serial', {
    p_delivery_order_id: deliveryOrderId,
    p_product_id: productId,
    p_serial: serial,
  });

  if (error) {
    // Sin la migración el RPC de registro ignoraría los seriales: mejor no capturarlos.
    if (error.code === 'PGRST202') {
      return { available: false, message: 'El registro de seriales aún no está habilitado en el servidor.' };
    }
    throw error;
  }

  const result = data as { available?: boolean; message?: string } | null;
  if (result?.available === false) {
    return { available: false, message: result.message || 'Este serial ya salió en otra salida.' };
  }
  return { available: true };
}
