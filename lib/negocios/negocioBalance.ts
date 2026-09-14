/**
 * Cálculo de saldos de un negocio a partir de sus cuotas y pagos.
 *
 * Misma fórmula que `search_customer_negocios` / `pull_mobile_sync` en SQL:
 * saldo = Σ max(amount + late_fee_amount - paid_amount, 0) sobre cuotas
 * no anuladas ni borradas. `negocios` no tiene columna `remaining_balance`,
 * por eso el valor se deriva siempre en cliente.
 */

export type CuotaBalanceInput = {
  amount: number | string | null | undefined;
  paid_amount?: number | string | null;
  late_fee_amount?: number | string | null;
  status?: string | null;
  deleted_at?: string | null;
};

export type PagoBalanceInput = {
  id?: string;
  amount: number | string | null | undefined;
  paid_at: string | null | undefined;
  receipt_status?: string | null;
  /** Desempata dos pagos con el mismo `paid_at`. */
  created_at?: string | null;
  /** Último desempate: consecutivo `RV-…` del recibo virtual. */
  virtual_receipt_number?: string | null;
  /** 'abono' | 'pronto_pago'; ausente en pagos anteriores al pronto pago. */
  payment_kind?: string | null;
  /**
   * Descuento por pronto pago. No es dinero recibido, pero sí baja el saldo
   * de las cuotas (`paid_amount` lo incluye).
   */
  discount_amount?: number | string | null;
};

export const PRONTO_PAGO_KIND = 'pronto_pago';

const toNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Reciben `object`: las filas de pagos anteriores al pronto pago no traen
// estas columnas y un tipo con todo opcional las rechazaría como «débiles».
export function isProntoPago(pago: object | null | undefined): boolean {
  return (pago as Pick<PagoBalanceInput, 'payment_kind'> | null | undefined)?.payment_kind === PRONTO_PAGO_KIND;
}

/** Descuento del pago (0 en abonos y en filas sin la columna). */
export function pagoDiscount(pago: object): number {
  return Math.max(toNumber((pago as Pick<PagoBalanceInput, 'discount_amount'>).discount_amount), 0);
}

/** Lo que el pago bajó del saldo del negocio: dinero recibido + descuento. */
export function pagoSettledAmount(pago: Pick<PagoBalanceInput, 'amount' | 'discount_amount'>): number {
  return toNumber(pago.amount) + pagoDiscount(pago);
}

/**
 * Totales de los pagos vigentes del negocio: `paid` es solo dinero recibido y
 * `discount` los descuentos por pronto pago, que se muestran aparte para que
 * «Crédito − Pagado» no parezca un faltante.
 */
export function summarizePagos(pagos: PagoBalanceInput[] | null | undefined): { paid: number; discount: number } {
  return (pagos || [])
    .filter((pago) => pago.receipt_status !== 'anulado')
    .reduce(
      (totals, pago) => ({
        paid: totals.paid + toNumber(pago.amount),
        discount: totals.discount + pagoDiscount(pago),
      }),
      { paid: 0, discount: 0 }
    );
}

export function cuotaSaldo(cuota: CuotaBalanceInput): number {
  return Math.max(
    toNumber(cuota.amount) + toNumber(cuota.late_fee_amount) - toNumber(cuota.paid_amount),
    0
  );
}

export function computeRemainingBalance(
  cuotas: CuotaBalanceInput[] | null | undefined
): number {
  if (!cuotas?.length) return 0;
  return cuotas
    .filter((cuota) => cuota.status !== 'anulada' && !cuota.deleted_at)
    .reduce((total, cuota) => total + cuotaSaldo(cuota), 0);
}

const compareText = (a: string | null | undefined, b: string | null | undefined) => {
  const left = a || '';
  const right = b || '';
  if (left === right) return 0;
  return left > right ? 1 : -1;
};

/**
 * Orden total y estable de los pagos de un negocio. `paid_at` lo fija el
 * usuario y admite empates —dos abonos a la misma hora—, así que hay que
 * desempatar por algo inmutable: primero el instante de registro y, si
 * también empata, el consecutivo del recibo virtual. Sin esto los recibos
 * imprimían el mismo saldo para ambos pagos.
 */
export function comparePagosOldestFirst(a: PagoBalanceInput, b: PagoBalanceInput): number {
  return (
    compareText(a.paid_at, b.paid_at) ||
    compareText(a.created_at, b.created_at) ||
    compareText(a.virtual_receipt_number, b.virtual_receipt_number) ||
    compareText(a.id, b.id)
  );
}

/**
 * Saldo que tenía el negocio justo después de registrar `pago`:
 * saldo actual + lo que bajaron los pagos emitidos posteriores (dinero y
 * descuento por pronto pago; sin el descuento, los recibos anteriores a un
 * pronto pago saldrían con un saldo menor al real).
 */
export function remainingAfterPago(
  cuotas: CuotaBalanceInput[] | null | undefined,
  pagos: PagoBalanceInput[] | null | undefined,
  pago: PagoBalanceInput
): number {
  const current = computeRemainingBalance(cuotas);
  const later = (pagos || [])
    .filter(
      (other) =>
        other !== pago &&
        (other.id == null || pago.id == null || other.id !== pago.id) &&
        other.receipt_status !== 'anulado' &&
        comparePagosOldestFirst(other, pago) > 0
    )
    .reduce((total, other) => total + pagoSettledAmount(other), 0);
  return Math.max(current + later, 0);
}
