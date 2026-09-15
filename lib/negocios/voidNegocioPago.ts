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

type VoidablePago = PagoBalanceInput & {
  receipt_status?: string | null;
  /** Cierre de recaudo que consolidó el pago (solo en los datos del servidor). */
  cierre_id?: string | null;
  /** `recaudo_cierres.numero` (CR-…); null si RLS no deja leer el cierre. */
  cierre_numero?: string | null;
};

/**
 * Pago incluido en un cierre de recaudo. Desde la migración 20261029120000
 * solo el administrador lo anula (con motivo y un ajuste negativo para el
 * próximo cierre), y lo hace desde la web: la app no ofrece la acción sobre
 * estos pagos para ningún rol y explica que solo un administrador puede.
 */
export function isPagoEnCierre(pago: Pick<VoidablePago, 'cierre_id'> | null | undefined): boolean {
  return Boolean(pago?.cierre_id);
}

/** Mismo texto que el servidor para quien no es admin; sin número de cierre no inventa uno. */
export function voidBlockedByCierreMessage(pago: Pick<VoidablePago, 'cierre_numero'>) {
  const cierre = pago.cierre_numero?.trim();
  return cierre
    ? `Solo un administrador puede anular un pago incluido en un cierre de recaudo (${cierre}).`
    : 'Solo un administrador puede anular un pago incluido en un cierre de recaudo.';
}

/** Pronto pago vigente (el más reciente) que impide anular `pago`, o null. */
export function blockingProntoPago<T extends VoidablePago>(
  pagos: T[] | null | undefined,
  pago: VoidablePago
): T | null {
  if (isProntoPago(pago)) return null;
  return (pagos || [])
    .filter(
      (other) =>
        other !== pago &&
        (other.id == null || other.id !== pago.id) &&
        other.receipt_status !== 'anulado' &&
        isProntoPago(other)
    )
    .sort((a, b) => comparePagosOldestFirst(b, a))[0] ?? null;
}

/**
 * Con un pronto pago vigente no se anula otro pago del negocio (el descuento
 * se calculó con esos abonos). Devuelve el consecutivo del pronto pago que
 * bloquea, o null. El servidor aplica la misma guarda.
 */
export function blockingProntoPagoReceipt(
  pagos: VoidablePago[] | null | undefined,
  pago: VoidablePago
): string | null {
  const blocking = blockingProntoPago(pagos, pago);
  if (!blocking) return null;
  return blocking.virtual_receipt_number || 'vigente';
}

export function voidBlockedByProntoPagoMessage(receipt: string) {
  return `Anule primero el pronto pago ${receipt} de este negocio`;
}

/**
 * Motivo por el que `pago` no se puede anular antes de abrir la hoja, o null.
 * Orden del servidor (para quien no es admin): el propio cierre, luego el
 * pronto pago vigente (y si ese pronto pago está en un cierre, solo un
 * administrador puede anularlo).
 */
export function voidBlockedMessage(pagos: VoidablePago[] | null | undefined, pago: VoidablePago): string | null {
  if (isPagoEnCierre(pago)) return voidBlockedByCierreMessage(pago);
  const blocking = blockingProntoPago(pagos, pago);
  if (!blocking) return null;
  const prontoReceipt = blocking.virtual_receipt_number || 'vigente';
  if (isPagoEnCierre(blocking)) {
    const cierre = blocking.cierre_numero?.trim();
    return `No se puede anular el pago ${pago.virtual_receipt_number || 'seleccionado'}: el pronto pago ${prontoReceipt} de este negocio está incluido en ${cierre ? `el cierre de recaudo ${cierre}` : 'un cierre de recaudo'} y solo un administrador puede anularlo.`;
  }
  return voidBlockedByProntoPagoMessage(prontoReceipt);
}

/**
 * La acción «Anular» se ofrece con permiso, en línea, sobre pagos vigentes ya
 * confirmados y que no estén en un cierre de recaudo. `cierre_id` solo llega en
 * los datos del servidor (select `*`); sin conexión la acción no se ofrece.
 */
export function canOfferVoidPago(input: {
  canVoid: boolean;
  online: boolean;
  fromLocal: boolean;
  pago: Pick<VoidablePago, 'receipt_status' | 'virtual_receipt_number' | 'cierre_id'>;
}): boolean {
  return (
    input.canVoid &&
    input.online &&
    !input.fromLocal &&
    input.pago.receipt_status !== 'anulado' &&
    !isPagoEnCierre(input.pago) &&
    Boolean(input.pago.virtual_receipt_number)
  );
}
