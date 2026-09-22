import { formatCOP } from '@/lib/creditCalculator';
import { errorMessage } from '@/lib/errorMessage';
import {
  MAX_MONEY_DECIMALS,
  clampMoneyDecimals,
  moneyToCents,
  parseMoneyInput,
  roundMoney,
  type MoneyInputOptions,
} from '@/lib/moneyInput';
import { MOBILE_PAYMENT_SITE } from '@/lib/paymentSite';
import { cuotaSaldo, type CuotaBalanceInput } from './negocioBalance';

/**
 * Reglas del descuento por pronto pago en la app (espejo de
 * `register_negocio_pronto_pago`, migración 20261023120000). El servidor es
 * quien decide; aquí se valida antes de enviar para dar mensajes en línea.
 */

export const PRONTO_PAGO_REASON_MAX_LENGTH = 500;
/** Mismo tope de dígitos enteros que el campo «Valor del pago». */
export const PRONTO_PAGO_MAX_INTEGER_DIGITS = 12;

export const PRONTO_PAGO_OFFLINE_MESSAGE =
  'Requiere conexión: el pronto pago solo se registra en línea.';
export const PRONTO_PAGO_PENDING_SYNC_MESSAGE =
  'Sincronice los cobros pendientes antes de liquidar.';

export type ProntoPagoCuotaInput = CuotaBalanceInput & {
  id?: string;
  installment_number?: number | string | null;
  due_date?: string | null;
};

export type ProntoPagoCuotaRow = {
  id: string;
  installmentNumber: number;
  dueDate: string | null;
  lateFee: number;
  saldo: number;
  status: string | null;
};

export type ProntoPagoSummary = {
  /** Cuotas con saldo, en orden FIFO (vencimiento, número). */
  cuotas: ProntoPagoCuotaRow[];
  /** Pendiente total redondeado a centavos: es el `p_expected_total`. */
  pendingTotal: number;
};

/** Cuotas pendientes y total pendiente (misma fórmula que `computeRemainingBalance`). */
export function buildProntoPagoSummary(
  cuotas: ProntoPagoCuotaInput[] | null | undefined
): ProntoPagoSummary {
  const rows = (cuotas || [])
    .filter((cuota) => cuota.status !== 'anulada' && !cuota.deleted_at)
    .map((cuota, index) => ({
      id: String(cuota.id ?? index),
      installmentNumber: Number(cuota.installment_number ?? 0),
      dueDate: cuota.due_date ?? null,
      lateFee: Number(cuota.late_fee_amount || 0) || 0,
      saldo: roundMoney(cuotaSaldo(cuota)),
      status: cuota.status ?? null,
    }))
    .filter((row) => moneyToCents(row.saldo) > 0)
    .sort(
      (a, b) =>
        (a.dueDate || '').localeCompare(b.dueDate || '') || a.installmentNumber - b.installmentNumber
    );
  const cents = (cuotas || [])
    .filter((cuota) => cuota.status !== 'anulada' && !cuota.deleted_at)
    .reduce((total, cuota) => total + moneyToCents(cuotaSaldo(cuota)), 0);
  return { cuotas: rows, pendingTotal: cents / 100 };
}

/**
 * Decimales del descuento: `formula_snapshot.money_decimal_places` del negocio,
 * luego la configuración de crédito activa y por último 2 (mismo orden que el
 * servidor), acotados a 0–2.
 */
export function prontoPagoDecimalPlaces(formulaSnapshot: unknown, settingsDecimals: unknown): number {
  const snapshotValue =
    formulaSnapshot && typeof formulaSnapshot === 'object'
      ? (formulaSnapshot as Record<string, unknown>).money_decimal_places
      : undefined;
  for (const candidate of [snapshotValue, settingsDecimals]) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    if (!Number.isFinite(Number(candidate))) continue;
    return clampMoneyDecimals(candidate);
  }
  return MAX_MONEY_DECIMALS;
}

export function prontoPagoDiscountInputOptions(decimalPlaces: number): MoneyInputOptions {
  return {
    decimalPlaces: clampMoneyDecimals(decimalPlaces),
    maxIntegerDigits: PRONTO_PAGO_MAX_INTEGER_DIGITS,
  };
}

/** Texto del campo («100.000,5») → descuento. Vacío equivale a $0 (liquidar sin descuento). */
export function parseProntoPagoDiscount(text: string, options: MoneyInputOptions): number {
  const raw = parseMoneyInput(text, options);
  if (!raw) return 0;
  return roundMoney(Number(raw), MAX_MONEY_DECIMALS);
}

/** Total a pagar = pendiente − descuento, calculado en centavos. */
export function prontoPagoNetAmount(pendingTotal: number, discount: number): number {
  return (moneyToCents(pendingTotal) - moneyToCents(discount)) / 100;
}

export type ProntoPagoValidationInput = {
  pendingTotal: number;
  discount: number;
  decimalPlaces: number;
  reason: string;
  paymentMethodId: string | null | undefined;
};

export type ProntoPagoValidation = {
  pendingError: string | null;
  discountError: string | null;
  reasonError: string | null;
  methodError: string | null;
  netAmount: number;
  valid: boolean;
};

export function validateProntoPago(input: ProntoPagoValidationInput): ProntoPagoValidation {
  const pendingCents = moneyToCents(input.pendingTotal);
  const pendingError = pendingCents > 0 ? null : 'El negocio no tiene saldo pendiente';

  let discountError: string | null = null;
  if (!Number.isFinite(input.discount)) {
    discountError = 'Indique un descuento válido';
  } else if (input.discount < 0) {
    discountError = 'El descuento no puede ser negativo';
  } else if (pendingCents > 0 && moneyToCents(input.discount) >= pendingCents) {
    discountError = `El descuento debe ser menor que el saldo pendiente (${formatCOP(input.pendingTotal)})`;
  } else if (roundMoney(input.discount, clampMoneyDecimals(input.decimalPlaces)) !== input.discount) {
    discountError = `El descuento admite como máximo ${clampMoneyDecimals(input.decimalPlaces)} decimales`;
  }

  const reason = String(input.reason ?? '').trim();
  // Motivo opcional (decisión 11.3 revisada); solo se limita el largo.
  const reasonError = reason.length > PRONTO_PAGO_REASON_MAX_LENGTH
    ? `El motivo del descuento admite como máximo ${PRONTO_PAGO_REASON_MAX_LENGTH} caracteres`
    : null;

  const methodError = input.paymentMethodId ? null : 'Seleccione el método de pago';
  const netAmount = Number.isFinite(input.discount)
    ? Math.max(prontoPagoNetAmount(input.pendingTotal, input.discount), 0)
    : 0;

  return {
    pendingError,
    discountError,
    reasonError,
    methodError,
    netAmount,
    valid: !pendingError && !discountError && !reasonError && !methodError,
  };
}

export type ProntoPagoRequest = {
  negocioId: string;
  /** Parada actual de una ruta de cobro; si viene, el RPC también la completa. */
  routeStopId?: string | null;
  expectedTotal: number;
  discountAmount: number;
  /** Opcional: en blanco se envía `null`. */
  discountReason?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
  paymentMethodId: string;
};

export type ProntoPagoRpcInput = ProntoPagoRequest & {
  paidAt: string;
  idempotencyKey: string;
};

export type ProntoPagoRpcCall =
  | { name: 'register_collection_route_pronto_pago'; args: Record<string, unknown> }
  | { name: 'register_negocio_pronto_pago'; args: Record<string, unknown> };

const trimOrNull = (value: string | null | undefined) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

export function buildProntoPagoRpcCall(input: ProntoPagoRpcInput): ProntoPagoRpcCall {
  const common = {
    // Redondeados a centavos: el servidor compara el esperado con tolerancia 0.009.
    p_expected_total: roundMoney(input.expectedTotal, MAX_MONEY_DECIMALS),
    p_discount_amount: roundMoney(input.discountAmount, MAX_MONEY_DECIMALS),
    p_discount_reason: trimOrNull(input.discountReason),
    p_paid_at: input.paidAt,
    p_receipt_number: trimOrNull(input.receiptNumber),
    p_notes: trimOrNull(input.notes),
    p_payment_method_id: input.paymentMethodId,
    p_idempotency_key: input.idempotencyKey,
    p_payment_site: MOBILE_PAYMENT_SITE,
  };
  if (input.routeStopId) {
    return {
      name: 'register_collection_route_pronto_pago',
      args: { p_stop_id: input.routeStopId, ...common },
    };
  }
  return {
    name: 'register_negocio_pronto_pago',
    args: { p_negocio_id: input.negocioId, ...common },
  };
}

/**
 * Huella de lo que el usuario confirmó. Mientras no cambie, un reintento tras
 * un fallo de red reutiliza la misma clave de idempotencia (y el mismo
 * `paid_at`), así que si el servidor ya lo registró devuelve el mismo pago.
 */
export function prontoPagoRequestFingerprint(input: ProntoPagoRequest): string {
  return JSON.stringify([
    input.negocioId,
    input.routeStopId || null,
    moneyToCents(input.expectedTotal),
    moneyToCents(input.discountAmount),
    trimOrNull(input.discountReason),
    trimOrNull(input.receiptNumber),
    trimOrNull(input.notes),
    input.paymentMethodId,
  ]);
}

/** «El saldo del negocio cambió (esperado $X, actual $Y). Recargue e intente de nuevo». */
export function isProntoPagoBalanceChangedError(message: string | null | undefined): boolean {
  return /saldo del negocio cambi/i.test(String(message ?? ''));
}

const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

const rawMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : error instanceof Error
      ? error.message
      : '';

/**
 * Mensaje para el usuario de un error del pronto pago o de la anulación. En
 * 42501 se conserva el texto del servidor («Sin permiso para …»), que dice qué
 * permiso falta; el genérico de `errorMessage` no.
 */
export function negocioPagoErrorMessage(error: unknown, fallback: string): string {
  const message = rawMessage(error).trim();
  if (errorCode(error) === '42501') {
    return /sin permiso/i.test(message)
      ? message
      : 'Sin permiso: solo el administrador o el gestor de cobro asignado al negocio pueden hacerlo.';
  }
  return errorMessage(error, fallback);
}

export function prontoPagoBlockReason(input: {
  online: boolean;
  fromLocal: boolean;
  hasPendingSync: boolean;
}): string | null {
  if (!input.online || input.fromLocal) return PRONTO_PAGO_OFFLINE_MESSAGE;
  if (input.hasPendingSync) return PRONTO_PAGO_PENDING_SYNC_MESSAGE;
  return null;
}

/**
 * «Registrar pago» se ofrece en negocios activos o entregados sólo a quien puede
 * registrarlo: admin o gestor de cobro asignado. El vendedor ya no, aunque sea el
 * dueño (20261111120000): antes el botón miraba sólo el estado y el servidor le
 * habría rechazado el pago.
 */
export function canOfferPago(input: { status: string | null | undefined; allowed: boolean }): boolean {
  return input.allowed && ['activo', 'entregado'].includes(String(input.status ?? ''));
}

/** El botón se ofrece en negocios activos o entregados con saldo, a quien tenga permiso. */
export function canOfferProntoPago(input: {
  status: string | null | undefined;
  pendingBalance: number;
  allowed: boolean;
}): boolean {
  return (
    input.allowed &&
    ['activo', 'entregado'].includes(String(input.status ?? '')) &&
    moneyToCents(input.pendingBalance) > 0
  );
}

/**
 * Permiso local (sin red) para abonos, igual que `can_register_negocio_pago`:
 * admin, gestor de cobro asignado o recaudador, que cobra en cualquier negocio
 * (20261113120000). Solo decide si se muestra el botón.
 */
export function localPagoPermission(input: {
  isAdmin: boolean;
  isGestorCobro: boolean;
  isRecaudador: boolean;
  gestorCobroId: string | null | undefined;
  userId: string | null | undefined;
}): boolean {
  if (input.isRecaudador) return true;
  return localProntoPagoPermission(input);
}

/**
 * Permiso local (sin red), igual que `can_register_negocio_pronto_pago`: admin o
 * gestor de cobro asignado. El recaudador no. Solo decide si se muestra el
 * botón (deshabilitado).
 */
export function localProntoPagoPermission(input: {
  isAdmin: boolean;
  isGestorCobro: boolean;
  gestorCobroId: string | null | undefined;
  userId: string | null | undefined;
}): boolean {
  if (input.isAdmin) return true;
  return Boolean(input.isGestorCobro && input.userId && input.gestorCobroId === input.userId);
}
