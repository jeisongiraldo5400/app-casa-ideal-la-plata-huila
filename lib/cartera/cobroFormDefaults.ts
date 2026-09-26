/**
 * Menos toques al cobrar: método de pago por defecto y atajos de valor
 * («Valor de la cuota vencida», «Cuota actual»). Módulo puro: sin React, sin
 * almacenamiento ni red, para probarlo entero.
 */
import { cuotaSaldo, type CuotaBalanceInput } from '@/lib/negocios/negocioBalance';

export type PaymentMethodLike = { id: string; name: string };

/**
 * Método que se preselecciona al abrir el cobro: el último que usó este
 * usuario en el teléfono (si sigue en el catálogo); si no, el de efectivo
 * (marcado `is_cash` en el servidor, lista guardada por «Cobros»); si esa
 * lista no se conoce, el que se llame «Efectivo». Sin coincidencia, ninguno:
 * el método sigue siendo obligatorio y lo elige la persona.
 */
export function pickDefaultPaymentMethod(
  methods: PaymentMethodLike[],
  options: { rememberedId: string | null; cashMethodIds: string[] | null }
): string | null {
  if (!methods.length) return null;
  if (options.rememberedId && methods.some((method) => method.id === options.rememberedId)) {
    return options.rememberedId;
  }
  if (options.cashMethodIds?.length) {
    const cash = methods.find((method) => options.cashMethodIds?.includes(method.id));
    if (cash) return cash.id;
  }
  const byName = methods.find((method) => /^\s*efectivo\b/i.test(method.name));
  return byName?.id ?? null;
}

export type CuotaForShortcut = CuotaBalanceInput & {
  due_date: string;
  installment_number?: number | null;
};

export type PagoAmountShortcut = {
  key: 'vencido' | 'actual';
  label: string;
  amount: number;
};

const isOpen = (cuota: CuotaForShortcut) =>
  cuota.status !== 'anulada' && !cuota.deleted_at && cuotaSaldo(cuota) > 0.009;

const byDue = (a: CuotaForShortcut, b: CuotaForShortcut) =>
  a.due_date.localeCompare(b.due_date) || Number(a.installment_number ?? 0) - Number(b.installment_number ?? 0);

/** Suma a centavos para no arrastrar ruido de coma flotante. */
const sumCents = (values: number[]) => values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;

/**
 * Atajos del campo «Valor del pago».
 * - «Valor de la cuota vencida»: el saldo de las cuotas que vencieron antes de
 *   hoy (con su mora). Si son varias lo dice.
 * - «Cuota actual»: el saldo de la próxima cuota que vence hoy o después.
 * Ninguno supera el saldo pendiente del negocio.
 */
export function pagoAmountShortcuts(
  cuotas: CuotaForShortcut[] | null | undefined,
  today: string,
  pendingBalance: number
): PagoAmountShortcut[] {
  const open = (cuotas || []).filter(isOpen).sort(byDue);
  const overdue = open.filter((cuota) => cuota.due_date < today);
  const current = open.find((cuota) => cuota.due_date >= today);
  const cap = (value: number) => Math.min(value, Math.max(pendingBalance, 0));
  const shortcuts: PagoAmountShortcut[] = [];
  if (overdue.length) {
    shortcuts.push({
      key: 'vencido',
      label: overdue.length === 1 ? 'Valor de la cuota vencida' : `Valor vencido (${overdue.length} cuotas)`,
      amount: cap(sumCents(overdue.map(cuotaSaldo))),
    });
  }
  if (current) {
    shortcuts.push({ key: 'actual', label: 'Cuota actual', amount: cap(cuotaSaldo(current)) });
  }
  return shortcuts.filter((shortcut) => shortcut.amount > 0);
}
