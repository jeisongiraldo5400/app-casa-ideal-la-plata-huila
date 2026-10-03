/**
 * Número de WhatsApp del cliente (el titular del negocio,
 * `negocios.customer_id` → `customers.phone`). Funciones puras: las usa
 * `lib/sharing/sharePdfToWhatsApp` para mandar el contrato y los recibos en
 * PDF directo al chat del cliente (Android).
 */

/** Indicativo de Colombia: `wa.me` y `whatsapp://send` lo exigen. */
export const COLOMBIA_COUNTRY_CODE = '57';

/**
 * Número para WhatsApp (solo dígitos, con indicativo), o `null` si el teléfono
 * no sirve para escribir por WhatsApp.
 *
 * - «300 123-4567», «(300) 1234567» → 573001234567 (celular de 10 dígitos que
 *   empieza por 3).
 * - «+57 300 123 4567», «57 3001234567», «0057…» → 573001234567.
 * - Fijos colombianos (601…, 7 dígitos) → `null`: no tienen WhatsApp.
 * - Otro país, solo si viene escrito con «+» o «00» (8 a 15 dígitos, E.164).
 */
export function toCustomerWhatsAppNumber(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  const international = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('3')) return `${COLOMBIA_COUNTRY_CODE}${digits}`;
  if (digits.length === 12 && digits.startsWith(`${COLOMBIA_COUNTRY_CODE}3`)) return digits;
  if (digits.startsWith(COLOMBIA_COUNTRY_CODE)) return null;
  if (international && digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/** Teléfono elegido para WhatsApp: el 1 si sirve; si no, el 2. */
export type CustomerWhatsAppTarget = { number: string; phone: string };

export function pickCustomerWhatsApp(
  phone: string | null | undefined,
  phoneSecondary: string | null | undefined
): CustomerWhatsAppTarget | null {
  for (const candidate of [phone, phoneSecondary]) {
    const number = toCustomerWhatsAppNumber(candidate);
    if (number) return { number, phone: (candidate ?? '').trim() };
  }
  return null;
}
