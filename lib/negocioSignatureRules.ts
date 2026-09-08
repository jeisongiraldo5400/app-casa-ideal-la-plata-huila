/**
 * Reglas de firmas de un negocio (espejo del trigger `enforce_negocio_signature_rule`).
 */

export const SELLER_SIGNATURE_REQUIRED_MESSAGE =
  'Si el cliente no firma ahora, la firma del vendedor es obligatoria. La firma del cliente podrá registrarse después.';

const hasSignature = (value: string | null | undefined): boolean =>
  Boolean(value && value.trim());

/**
 * Sin firma del cliente, la firma del vendedor es obligatoria.
 * Devuelve el mensaje de error o `null` si la combinación es válida.
 */
export function sellerSignatureRequiredError(
  customerSignature: string | null | undefined,
  sellerSignature: string | null | undefined
): string | null {
  if (hasSignature(customerSignature) || hasSignature(sellerSignature)) return null;
  return SELLER_SIGNATURE_REQUIRED_MESSAGE;
}

export const SIGNATURE_SAVE_BLOCKED_MESSAGE =
  'Falta firmar: dibuja la firma del vendedor o sube su PNG. Sin al menos una firma el negocio no se puede guardar, ni siquiera como borrador.';

/**
 * Motivo por el que no se puede guardar el negocio, redactado como acción a
 * realizar. No repite el aviso que ya está en pantalla: lo complementa.
 *
 * El trigger `enforce_negocio_signature_rule` comprueba la regla también en el
 * INSERT, así que sin firma no sale ni el borrador: los dos botones del último
 * paso quedan bloqueados, no solo "Activar negocio".
 */
export function negocioSaveBlockedBySignature(
  customerSignature: string | null | undefined,
  sellerSignature: string | null | undefined
): string | null {
  return sellerSignatureRequiredError(customerSignature, sellerSignature)
    ? SIGNATURE_SAVE_BLOCKED_MESSAGE
    : null;
}

const LATE_CUSTOMER_SIGNATURE_STATUSES = new Set(['activo', 'entregado']);

/**
 * Un negocio ya activado (o entregado) sin firma del cliente admite registrarla
 * después desde el detalle. Los borradores la registran antes de activar.
 */
export function canRegisterCustomerSignatureLater(
  negocio:
    | { status: string | null | undefined; customer_signature_url: string | null | undefined }
    | null
    | undefined
): boolean {
  if (!negocio?.status) return false;
  return (
    LATE_CUSTOMER_SIGNATURE_STATUSES.has(negocio.status) &&
    !hasSignature(negocio.customer_signature_url)
  );
}
