/**
 * Idempotencia de las escrituras de traslados (contrato §3).
 *
 * La clave se guarda en AsyncStorage por operación + huella de los datos
 * (traslado, líneas, notas): si la respuesta se pierde por la red y el usuario
 * vuelve a confirmar lo mismo, viaja la MISMA clave y el servidor responde la
 * original con `replayed: true`, sin repetir el movimiento. Tras un éxito se
 * borra; tras un rechazo del servidor también (la transacción se deshizo y con
 * otros datos la huella cambia de todos modos). Solo una caída de red la
 * conserva para el reintento.
 */
import { clearPersistentIdempotencyKey, getOrCreatePersistentIdempotencyKey } from '@/lib/idempotency';
import { isOfflineError } from '@/lib/errorMessage';

export type TransferOperation = 'transfer_dispatch' | 'transfer_receive' | 'transfer_return';

export async function runIdempotentTransferWrite<T>(
  operation: TransferOperation,
  fingerprint: unknown,
  run: (idempotencyKey: string) => Promise<T>
): Promise<T> {
  const print = JSON.stringify(fingerprint);
  const key = await getOrCreatePersistentIdempotencyKey(operation, print);
  try {
    const result = await run(key);
    await clearPersistentIdempotencyKey(operation, print).catch(() => undefined);
    return result;
  } catch (error) {
    if (!isOfflineError(error)) {
      await clearPersistentIdempotencyKey(operation, print).catch(() => undefined);
    }
    throw error;
  }
}
