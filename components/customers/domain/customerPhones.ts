import * as Yup from 'yup';

/**
 * Teléfonos del cliente: `phone` y el opcional `phone_secondary`
 * («Teléfono 2», migración 20261231240000). Mismas reglas que el panel web
 * (`customers/domain/customerPhones.ts`): hasta 20 caracteres cada uno
 * (`phone` es varchar(20) y `phone_secondary` tiene un CHECK igual), recortados
 * y `null` si quedan vacíos; el segundo no puede ser el mismo número.
 */
export const CUSTOMER_PHONE_MAX_LENGTH = 20;
export const CUSTOMER_PHONE_MAX_MESSAGE = `El teléfono no puede exceder ${CUSTOMER_PHONE_MAX_LENGTH} caracteres`;
export const CUSTOMER_PHONE_SECONDARY_MAX_MESSAGE = `El teléfono 2 no puede exceder ${CUSTOMER_PHONE_MAX_LENGTH} caracteres`;
export const CUSTOMER_PHONE_REPEATED_MESSAGE = 'Es el mismo número del teléfono 1';

/** Solo los dígitos, para comparar «300 123-4567» con «3001234567». */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Valor a guardar: recortado, y `null` si queda vacío. */
export function toStoredPhone(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
}

/** true si los dos teléfonos son el mismo número (por sus dígitos). */
export function isSamePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const digits = phoneDigits(a);
  return digits !== '' && digits === phoneDigits(b);
}

/** Teléfonos para mostrar y marcar, sin vacíos ni repetidos. */
export function customerPhoneList(
  phone: string | null | undefined,
  phoneSecondary: string | null | undefined
): string[] {
  const first = toStoredPhone(phone);
  const second = toStoredPhone(phoneSecondary);
  const list = first ? [first] : [];
  if (second && !isSamePhone(first, second)) list.push(second);
  return list;
}

/** «300 111 2222 / 310 555 0101», o `null` si no tiene ninguno. */
export function formatCustomerPhones(
  phone: string | null | undefined,
  phoneSecondary: string | null | undefined
): string | null {
  const list = customerPhoneList(phone, phoneSecondary);
  return list.length ? list.join(' / ') : null;
}

/** Reglas Yup de los dos campos, para formularios con Formik. */
export const customerPhoneSchema = Yup.string().trim().max(CUSTOMER_PHONE_MAX_LENGTH, CUSTOMER_PHONE_MAX_MESSAGE);
export const customerPhoneSecondarySchema = Yup.string()
  .trim()
  .max(CUSTOMER_PHONE_MAX_LENGTH, CUSTOMER_PHONE_SECONDARY_MAX_MESSAGE)
  .test('distinto-del-primero', CUSTOMER_PHONE_REPEATED_MESSAGE, function (value) {
    return !isSamePhone(this.parent.phone, value);
  });

/**
 * Error de los dos teléfonos, o `null` si están bien. Para formularios sin
 * Formik (asistente de negocio, edición de teléfonos).
 */
export function customerPhonesError(
  phone: string | null | undefined,
  phoneSecondary: string | null | undefined
): string | null {
  if ((toStoredPhone(phone) ?? '').length > CUSTOMER_PHONE_MAX_LENGTH) return CUSTOMER_PHONE_MAX_MESSAGE;
  if ((toStoredPhone(phoneSecondary) ?? '').length > CUSTOMER_PHONE_MAX_LENGTH) {
    return CUSTOMER_PHONE_SECONDARY_MAX_MESSAGE;
  }
  if (isSamePhone(phone, phoneSecondary)) return CUSTOMER_PHONE_REPEATED_MESSAGE;
  return null;
}
