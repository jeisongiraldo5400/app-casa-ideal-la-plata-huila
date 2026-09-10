/**
 * Seriales de fábrica opcionales, compartidos por los flujos de entradas y salidas.
 * La validación definitiva la hace el RPC de registro; esto es la regla local.
 */

export type SerialCaptureMethod = 'scan' | 'manual';

/** Serial de fábrica capturado (opcionalmente) para una unidad. */
export interface CapturedSerial {
  /** Tal como se escaneó o escribió, sin espacios al inicio/fin. */
  serial: string;
  /** Clave de comparación; misma regla que public.normalize_serial en BD. */
  normalized: string;
  method: SerialCaptureMethod;
  /**
   * Solo salidas: true si el serial entró a la misma bodega y sigue en stock (verificado
   * en entradas); false si no está registrado en entradas; undefined si no se pudo consultar.
   */
  verified?: boolean;
}

export const MAX_SERIAL_LENGTH = 100;

/** Solo letras y números, en mayúsculas: "ab-123 45" y "AB12345" son el mismo serial. */
export function normalizeSerial(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
}

export type SerialAvailability =
  | { available: true; verified?: boolean }
  | { available: false; message: string };

/** Mensaje cuando el servidor aún no tiene la migración de seriales. */
export const SERIALS_NOT_ENABLED_MESSAGE = 'El registro de seriales aún no está habilitado en el servidor.';

/**
 * Validación local de un serial antes de consultar al servidor.
 * Devuelve el serial recortado y normalizado, o el mensaje de error.
 */
export function validateSerialInput(
  raw: string,
  current: CapturedSerial[],
  quantity: number
): { ok: true; serial: string; normalized: string } | { ok: false; error: string } {
  const serial = raw.trim();
  const normalized = normalizeSerial(serial);
  if (!normalized) {
    return { ok: false, error: 'Escribe o escanea un serial válido' };
  }
  if (serial.length > MAX_SERIAL_LENGTH) {
    return { ok: false, error: `El serial no puede superar ${MAX_SERIAL_LENGTH} caracteres` };
  }
  if (current.length >= quantity) {
    return { ok: false, error: 'Ya hay un serial por cada unidad. Aumenta la cantidad para agregar otro.' };
  }
  return { ok: true, serial, normalized };
}

/** " · Seriales: A, B" para la línea de detalle de un producto (vacío si no hay). */
export function serialsSummary(serials: CapturedSerial[] | undefined, showVerification = false): string {
  if (!serials?.length) return '';
  const labels = serials.map((serial) => {
    if (!showVerification || serial.verified === undefined) return serial.serial;
    return `${serial.serial} (${serial.verified ? 'verificado' : 'no registrado'})`;
  });
  return ` · Seriales: ${labels.join(', ')}`;
}
