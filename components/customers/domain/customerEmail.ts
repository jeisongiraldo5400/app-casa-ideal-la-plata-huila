import * as Yup from 'yup';

/**
 * Correo electrónico del cliente: opcional. Misma regla que el panel web
 * (`customerValidationSchema`): formato de correo y máximo 255 caracteres;
 * vacío es válido. Además exige un punto en el dominio, igual que
 * `create_customer_offline` (migración 20261210120000): Yup acepta «a@b» y el
 * servidor lo rechazaría al sincronizar un alta hecha sin señal.
 */
export const CUSTOMER_EMAIL_MAX_LENGTH = 255;
export const CUSTOMER_EMAIL_FORMAT_MESSAGE = 'El correo electrónico no tiene un formato válido';
export const CUSTOMER_EMAIL_MAX_MESSAGE = `El correo electrónico no puede exceder ${CUSTOMER_EMAIL_MAX_LENGTH} caracteres`;

/** Regla Yup para el campo en formularios con Formik. */
export const customerEmailSchema = Yup.string()
  .trim()
  .max(CUSTOMER_EMAIL_MAX_LENGTH, CUSTOMER_EMAIL_MAX_MESSAGE)
  .email(CUSTOMER_EMAIL_FORMAT_MESSAGE)
  .matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: CUSTOMER_EMAIL_FORMAT_MESSAGE, excludeEmptyString: true });

/**
 * Mensaje de error del correo escrito, o `null` si es válido o está vacío.
 * Para formularios sin Formik (asistente de negocio).
 */
export function customerEmailError(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  try {
    customerEmailSchema.validateSync(value);
    return null;
  } catch (error) {
    return error instanceof Yup.ValidationError ? error.message : CUSTOMER_EMAIL_FORMAT_MESSAGE;
  }
}

/** Valor a guardar: recortado y en minúsculas; vacío queda en `null`. */
export function normalizeCustomerEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? '';
  return value || null;
}
