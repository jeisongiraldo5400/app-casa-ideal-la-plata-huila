import { formatCOP } from '@/lib/creditCalculator';
import { formatPaymentDateTime } from '@/lib/localDate';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { cuotaSaldo, type CuotaBalanceInput } from '@/lib/negocios/negocioBalance';

/**
 * Compartir un negocio por WhatsApp con el chat del cliente (el titular del
 * negocio, `negocios.customer_id` → `customers.phone`). Funciones puras: las
 * usa la ficha del negocio para el contrato y los recibos en PDF.
 *
 * WhatsApp no deja adjuntar un archivo a un chat concreto por URL: el enlace
 * abre el chat del cliente con un mensaje de texto, y el PDF sigue saliendo
 * por la hoja de compartir del sistema.
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

/** App de WhatsApp con el chat del número y el mensaje escrito. */
export function buildWhatsAppChatAppUrl(number: string, message: string): string {
  return `whatsapp://send?phone=${number}&text=${encodeURIComponent(message)}`;
}

/** Primer nombre para el saludo («MARÍA JOSÉ PÉREZ» → «María»). */
export function greetingName(customerName: string | null | undefined): string {
  const first = (customerName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first || first.toLowerCase() === 'cliente') return '';
  return first.charAt(0).toLocaleUpperCase('es-CO') + first.slice(1).toLocaleLowerCase('es-CO');
}

function greeting(customerName: string | null | undefined): string {
  const name = greetingName(customerName);
  return name ? `Hola ${name}.` : 'Hola.';
}

export type NegocioWhatsAppSummary = {
  numero: number | null | undefined;
  customerName: string | null | undefined;
  totalCredit: number;
  pendingBalance: number;
  /** Próxima cuota sin pagar, si la hay. */
  nextCuota?: { dueDate: string; amount: number } | null;
};

/** Primera cuota con saldo (por fecha), sin anuladas ni borradas. */
export function nextPendingCuota(
  cuotas: (CuotaBalanceInput & { due_date?: string | null })[] | null | undefined
): { dueDate: string; amount: number } | null {
  const pending = (cuotas ?? [])
    .filter((cuota) => cuota.status !== 'anulada' && !cuota.deleted_at && cuota.due_date && cuotaSaldo(cuota) > 0)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const next = pending[0];
  return next ? { dueDate: String(next.due_date), amount: cuotaSaldo(next) } : null;
}

/** Mensaje del contrato: el PDF va aparte, por la hoja de compartir. */
export function buildNegocioWhatsAppMessage(summary: NegocioWhatsAppSummary): string {
  const lines = [
    `${greeting(summary.customerName)} Le escribimos de Casa Ideal sobre su negocio N.º ${formatNegocioCodigo(summary.numero)}.`,
    `Total del crédito: ${formatCOP(summary.totalCredit)}`,
    `Saldo pendiente: ${formatCOP(summary.pendingBalance)}`,
  ];
  if (summary.nextCuota && summary.pendingBalance > 0) {
    lines.push(`Próxima cuota: ${formatCOP(summary.nextCuota.amount)} el ${formatPaymentDateTime(summary.nextCuota.dueDate.slice(0, 10))}`);
  }
  return lines.join('\n');
}

export type ReceiptWhatsAppSummary = {
  customerName: string | null | undefined;
  receiptNumber: string | null | undefined;
  negocioNumero: number | null | undefined;
  amount: number;
  paidAt: string | null | undefined;
  remainingBalance: number;
  /** Pago tomado sin señal que el servidor aún no confirma. */
  pendingConfirmation?: boolean;
};

export function buildReceiptWhatsAppMessage(summary: ReceiptWhatsAppSummary): string {
  const receipt = summary.receiptNumber ? `el recibo ${summary.receiptNumber}` : 'su recibo';
  const lines = [
    `${greeting(summary.customerName)} Le escribimos de Casa Ideal con ${receipt} de su negocio N.º ${formatNegocioCodigo(summary.negocioNumero)}.`,
    `Abono: ${formatCOP(summary.amount)}${summary.paidAt ? ` (${formatPaymentDateTime(summary.paidAt)})` : ''}`,
    `Saldo pendiente: ${formatCOP(summary.remainingBalance)}`,
  ];
  if (summary.pendingConfirmation) lines.push('Pago pendiente de confirmar.');
  return lines.join('\n');
}
