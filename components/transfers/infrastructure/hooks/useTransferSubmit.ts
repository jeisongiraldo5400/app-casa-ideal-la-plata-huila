import { useCallback, useState } from 'react';
import { errorMessage, isOfflineError } from '@/lib/errorMessage';
import { runIdempotentTransferWrite, type TransferOperation } from '../services/transferSubmission';
import { TransferPhotoUploadError } from '../services/transferPhotosService';

export const SUBMIT_OFFLINE_MESSAGE =
  'Sin conexión con el servidor. Lo que marcaste sigue guardado: confirma de nuevo cuando vuelva la señal (no se registrará dos veces).';

export const photoUploadMessage = (detail: string) =>
  `No se pudo subir la foto (${detail}). No se registró nada: confirma de nuevo o quita la foto.`;

/**
 * Envía una escritura de traslado con clave de idempotencia y deja el error
 * del servidor en español tal cual (quien despachó no puede recibir, etc.).
 *
 * `prepare` corre antes (subir fotos): si falla, la RPC no se llama. Las
 * fotos tienen ruta fija desde que se toman, así que la huella —y con ella la
 * clave de idempotencia— es la misma en el reintento.
 */
export function useTransferSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      operation: TransferOperation,
      fingerprint: unknown,
      call: (idempotencyKey: string) => Promise<T>,
      prepare?: () => Promise<void>
    ): Promise<T | null> => {
      setSubmitting(true);
      setError(null);
      try {
        if (prepare) await prepare();
        return await runIdempotentTransferWrite(operation, fingerprint, call);
      } catch (err) {
        if (err instanceof TransferPhotoUploadError) {
          setError(isOfflineError(err) ? SUBMIT_OFFLINE_MESSAGE : photoUploadMessage(err.message));
          return null;
        }
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
