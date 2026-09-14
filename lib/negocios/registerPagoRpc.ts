import {
  MAX_MONEY_DECIMALS,
  clampMoneyDecimals,
  moneyToCents,
  parseMoneyInput,
  roundMoney,
  type MoneyInputOptions,
} from '@/lib/moneyInput';
import { MOBILE_PAYMENT_SITE } from '@/lib/paymentSite';

/**
 * Llamada RPC que registra un pago en el servidor, compartida por el cobro con
 * red (detalle del negocio / parada de ruta) y por el envío de la cola offline,
 * para que ambos manden exactamente los mismos argumentos.
 */
export type RegisterPagoRpcInput = {
  negocioId: string;
  /** Parada de ruta de cobro; si viene, el pago también completa la parada. */
  routeStopId?: string | null;
  amount: number;
  paidAt: string;
  receiptNumber?: string | null;
  notes?: string | null;
  idempotencyKey: string;
  /** Obligatorio en el servidor desde 20261018130000; los comandos viejos pueden no traerlo. */
  paymentMethodId?: string | null;
  /** Los comandos encolados antes del sitio de pago no lo traen: son cobros de la app. */
  paymentSite?: string | null;
};

export type RegisterPagoRpcCall =
  | { name: 'register_collection_route_payment'; args: Record<string, unknown> }
  | { name: 'register_negocio_pago'; args: Record<string, unknown> };

/**
 * Monto que viaja al servidor: redondeado a centavos (`numeric(14,2)`) para no
 * mandar ruido de coma flotante. Un entero no cambia, así que el hash de
 * idempotencia de los comandos ya encolados sigue siendo el mismo.
 */
export function normalizePagoAmountForServer(amount: number): number {
  return roundMoney(Number(amount), MAX_MONEY_DECIMALS);
}

export function buildRegisterPagoRpcCall(input: RegisterPagoRpcInput): RegisterPagoRpcCall {
  const common = {
    p_amount: normalizePagoAmountForServer(input.amount),
    p_paid_at: input.paidAt,
    p_receipt_number: input.receiptNumber ?? null,
    // La imputación la hace el servidor en FIFO.
    p_cuota_id: null,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_payment_method_id: input.paymentMethodId ?? null,
    // Todo cobro hecho desde esta app se registra como Aplicación Móvil.
    p_payment_site: input.paymentSite ?? MOBILE_PAYMENT_SITE,
  };
  if (input.routeStopId) {
    return {
      name: 'register_collection_route_payment',
      args: { p_stop_id: input.routeStopId, ...common },
    };
  }
  return {
    name: 'register_negocio_pago',
    args: { p_negocio_id: input.negocioId, ...common },
  };
}

/** Tope de dígitos enteros del campo «Valor del pago» (hasta 999.999.999.999). */
export const PAGO_AMOUNT_MAX_INTEGER_DIGITS = 12;

/**
 * Opciones del campo de valor: los decimales de la configuración de crédito
 * (`money_decimal_places`, acotados a 0–2) o 2 si no se conocen, igual que la web.
 */
export function pagoAmountInputOptions(decimalPlaces: unknown): MoneyInputOptions {
  return {
    decimalPlaces:
      decimalPlaces === null || decimalPlaces === undefined
        ? MAX_MONEY_DECIMALS
        : clampMoneyDecimals(decimalPlaces),
    maxIntegerDigits: PAGO_AMOUNT_MAX_INTEGER_DIGITS,
  };
}

/** Texto del campo («93.333,33») → monto a cobrar (93333.33); NaN si no hay valor. */
export function parsePagoAmountInput(text: string, options: MoneyInputOptions): number {
  const raw = parseMoneyInput(text, options);
  if (!raw) return NaN;
  return roundMoney(Number(raw), Math.min(options.decimalPlaces, MAX_MONEY_DECIMALS));
}

/** El pago supera el saldo pendiente (comparado en centavos enteros). */
export function pagoAmountExceedsBalance(amount: number, pendingBalance: number): boolean {
  return moneyToCents(amount) > moneyToCents(pendingBalance);
}
