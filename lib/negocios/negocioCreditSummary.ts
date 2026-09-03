import { formatCOP, type CreditCalcResult, type CreditSettingsInput } from '@/lib/creditCalculator';
import { downPaymentScheduleTotal, sortDownPaymentSchedule, type DownPaymentEntry } from './negocioCreditRules';

/**
 * Resumen legible del crédito que se muestra al vendedor mientras arma el
 * negocio: valor de productos, interés, cada abono inicial pactado, saldo a
 * financiar y el plan de cuotas con la explicación de por qué la cuota da ese
 * valor y cómo queda la última. Los textos son los mismos en web y móvil.
 */
export interface CreditSummaryDownPayment {
  label: string;
  dueDate: string;
  amount: number;
}

export interface CreditSummaryPlan {
  installmentsCount: number;
  installmentAmount: number;
  frequencyLabel: string;
  firstDueDate: string | null;
  /** Cuotas con el valor regular (todas menos la última cuando hay ajuste). */
  regularCount: number;
  lastInstallmentAmount: number;
  /** 'Saldo a financiar … ÷ n cuotas = …' */
  calculation: string;
}

export interface CreditSummary {
  productsSubtotal: number;
  interestAmount: number;
  interestNote: string;
  totalCredit: number;
  downPayments: CreditSummaryDownPayment[];
  downPaymentTotal: number;
  financedAmount: number;
  /** `null` cuando los abonos cubren el valor de los productos. */
  plan: CreditSummaryPlan | null;
}

export interface CreditSummaryInput {
  calc: CreditCalcResult;
  settings: CreditSettingsInput;
  schedule: DownPaymentEntry[];
  frequency: string;
  firstDueDate?: string | null;
}

export function frequencyPluralLabel(frequency: string): string {
  if (frequency === 'quincenal') return 'quincenales';
  if (frequency === 'semanal') return 'semanales';
  return 'mensuales';
}

function formatMonths(months: number): string {
  const rounded = Math.round(months * 100) / 100;
  return `${rounded} ${rounded === 1 ? 'mes' : 'meses'}`;
}

export function buildNegocioCreditSummary({
  calc,
  settings,
  schedule,
  frequency,
  firstDueDate,
}: CreditSummaryInput): CreditSummary {
  // formatCOP móvil siempre imprime COP sin decimales.
  const money = (value: number) => formatCOP(value);
  const n = calc.installmentsCount;
  const rate = Number(settings.interest_rate_monthly_pct) || 0;
  const monthsFactor = frequency === 'semanal' ? 7 / 30 : frequency === 'quincenal' ? 0.5 : 1;
  const financedMonths = n * monthsFactor;

  const sorted = sortDownPaymentSchedule(schedule);
  const downPayments = sorted.map((entry, index) => ({
    label: index === 0 ? 'Cuota inicial' : `Abono ${index + 1}`,
    dueDate: entry.due_date,
    amount: Number.isFinite(entry.amount) ? entry.amount : 0,
  }));
  const downPaymentTotal = downPaymentScheduleTotal(sorted);

  let interestNote: string;
  if (n === 0 || calc.interestAmount <= 0) {
    interestNote = rate > 0 && n === 0
      ? 'Sin interés: no queda saldo por financiar'
      : rate > 0
        ? 'Sin interés sobre este saldo'
        : 'Sin interés configurado';
  } else if (settings.formula_type === 'simple_markup') {
    interestNote = `${rate}% mensual sobre el valor de los productos durante ${formatMonths(financedMonths)}`;
  } else if (settings.formula_type === 'financed_balance') {
    interestNote = `${rate}% mensual sobre el saldo después de abonos (${money(
      Math.max(0, calc.productsSubtotal - calc.downPayment)
    )}) durante ${formatMonths(financedMonths)}`;
  } else {
    interestNote = 'El valor de los productos ya incluye el interés';
  }

  let plan: CreditSummaryPlan | null = null;
  if (n > 0) {
    const lastInstallmentAmount = Math.max(
      0,
      Math.round((calc.financedAmount - calc.installmentAmount * (n - 1)) * 100) / 100
    );
    const adjusted = Math.abs(lastInstallmentAmount - calc.installmentAmount) > 0.009;
    const calculation = `Saldo a financiar ${money(calc.financedAmount)} ÷ ${n} cuotas = ${money(
      calc.installmentAmount
    )}.`;
    plan = {
      installmentsCount: n,
      installmentAmount: calc.installmentAmount,
      frequencyLabel: frequencyPluralLabel(frequency),
      firstDueDate: firstDueDate || null,
      regularCount: adjusted ? n - 1 : n,
      lastInstallmentAmount,
      calculation,
    };
  }

  return {
    productsSubtotal: calc.productsSubtotal,
    interestAmount: calc.interestAmount,
    interestNote,
    totalCredit: calc.totalCredit,
    downPayments,
    downPaymentTotal,
    financedAmount: calc.financedAmount,
    plan,
  };
}
