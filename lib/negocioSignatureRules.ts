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
