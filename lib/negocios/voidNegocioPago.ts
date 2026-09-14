import { comparePagosOldestFirst, isProntoPago, type PagoBalanceInput } from './negocioBalance';

/**
 * Anulación de pagos desde la app (abonos y pronto pago). La regla de permiso
 * vive en el servidor (`can_void_negocio_pago`: admin o gestor de cobro
 * asignado); aquí solo lo que decide la interfaz.
 */

/** Motivo mínimo: el servidor solo exige que no esté vacío; se pide algo legible. */
export const VOID_REASON_MIN_LENGTH = 5;
export const VOID_REASON_MAX_LENGTH = 500;

export function validateVoidReason(reason: string | null | undefined): string | null {
  const text = String(reason ?? '').trim();
  if (!text) return 'El motivo de anulación es obligatorio';
  if (text.length < VOID_REASON_MIN_LENGTH) {
    return `Describa el motivo con al menos ${VOID_REASON_MIN_LENGTH} caracteres`;
  }
  if (text.length > VOID_REASON_MAX_LENGTH) {
    return `El motivo admite como máximo ${VOID_REASON_MAX_LENGTH} caracteres`;
  }
  return null;
}

type VoidablePago = PagoBalanceInput & { receipt_status?: string | null };

/**
 * Con un pronto pago vigente no se anula otro pago del negocio (el descuento
 * se calculó con esos abonos). Devuelve el consecutivo del pronto pago que
 * bloquea, o null. El servidor aplica la misma guarda.
 */
export function blockingProntoPagoReceipt(
  pagos: VoidablePago[] | null | undefined,
  pago: VoidablePago
): string | null {
  if (isProntoPago(pago)) return null;
  const blocking = (pagos || [])
    .filter(
      (other) =>
        other !== pago &&
        (other.id == null || other.id !== pago.id) &&
        other.receipt_status !== 'anulado' &&
        isProntoPago(other)
    )
    .sort((a, b) => comparePagosOldestFirst(b, a))[0];
  if (!blocking) return null;
  return blocking.virtual_receipt_number || 'vigente';
}

export function voidBlockedByProntoPagoMessage(receipt: string) {
  return `Anule primero el pronto pago ${receipt} de este negocio`;
}

/** La acción «Anular» se ofrece con permiso, en línea y sobre pagos vigentes ya confirmados. */
export function canOfferVoidPago(input: {
  canVoid: boolean;
  online: boolean;
  fromLocal: boolean;
  pago: Pick<VoidablePago, 'receipt_status' | 'virtual_receipt_number'>;
}): boolean {
  return (
    input.canVoid &&
    input.online &&
    !input.fromLocal &&
    input.pago.receipt_status !== 'anulado' &&
    Boolean(input.pago.virtual_receipt_number)
  );
}
