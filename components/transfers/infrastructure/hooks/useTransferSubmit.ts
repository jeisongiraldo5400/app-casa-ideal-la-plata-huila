import { useCallback, useState } from 'react';
import { errorMessage, isOfflineError } from '@/lib/errorMessage';
import { runIdempotentTransferWrite, type TransferOperation } from '../services/transferSubmission';

export const SUBMIT_OFFLINE_MESSAGE =
  'Sin conexión con el servidor. Lo que marcaste sigue guardado: confirma de nuevo cuando vuelva la señal (no se registrará dos veces).';

/**
 * Envía una escritura de traslado con clave de idempotencia y deja el error
 * del servidor en español tal cual (quien despachó no puede recibir, etc.).
 */
export function useTransferSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      operation: TransferOperation,
      fingerprint: unknown,
      call: (idempotencyKey: string) => Promise<T>
    ): Promise<T | null> => {
      setSubmitting(true);
      setError(null);
      try {
        return await runIdempotentTransferWrite(operation, fingerprint, call);
      } catch (err) {
        setError(isOfflineError(err) ? SUBMIT_OFFLINE_MESSAGE : errorMessage(err, 'No fue posible registrar el traslado'));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return { submitting, error, setError, run };
}
