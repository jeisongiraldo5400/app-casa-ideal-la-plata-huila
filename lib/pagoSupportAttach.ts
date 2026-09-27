import {
  canUseLocalDb,
  queueSupportForExistingPago,
} from '@/lib/offline/repositories/offlineRepository';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  uploadAndAttachPagoSupport,
  validatePagoSupportLocalFile,
  type PagoSupportLocalFile,
} from '@/lib/uploadPagoSupport';

export type PagoSupportAttachOutcome = 'attached' | 'queued';

/**
 * Adjunta el soporte a un pago que YA existe (cobro recién registrado con
 * señal, pronto pago o «Adjuntar después»).
 *
 * - Con señal: sube el archivo y llama a `attach_negocio_pago_support`.
 * - Sin señal (o si la subida se corta por red): copia el archivo al teléfono
 *   y encola `attach_pago_support` (`queueSupportForExistingPago`).
 * - Pago que solo existe en el teléfono: siempre se encola, en su carril.
 *
 * `queueOnAnyError`: tras registrar un cobro, cualquier fallo del soporte se
 * reintenta desde la cola en vez de perderse (comportamiento de siempre del
 * cobro). En «Adjuntar después» solo se encola por red: un rechazo del
 * servidor (permiso, ya tiene soporte) se muestra al usuario.
 */
export async function attachOrQueuePagoSupport(input: {
  negocioId: string;
  pagoId: string;
  file: PagoSupportLocalFile;
  online: boolean;
  pagoIsLocal?: boolean;
  queueOnAnyError?: boolean;
}): Promise<PagoSupportAttachOutcome> {
  const validationError = validatePagoSupportLocalFile(input.file);
  if (validationError) throw new Error(validationError);

  const queue = async () => {
    await queueSupportForExistingPago({ negocioId: input.negocioId, pagoId: input.pagoId, file: input.file });
    return 'queued' as const;
  };

  if (input.pagoIsLocal || !input.online) {
    if (!canUseLocalDb()) {
      throw new Error('Sin conexión: adjunte el soporte cuando vuelva la señal.');
    }
    return queue();
  }

  try {
    await uploadAndAttachPagoSupport({ negocioId: input.negocioId, pagoId: input.pagoId, file: input.file });
    return 'attached';
  } catch (error) {
    if ((input.queueOnAnyError || isNetworkError(error)) && canUseLocalDb()) {
      return queue();
    }
    throw error;
  }
}
