export type CreditFormulaType =
  | "cash_includes_interest"
  | "simple_markup"
  | "financed_balance";

export type CreditFrequency = "mensual" | "quincenal" | "semanal";

export interface CreditSettingsInput {
  formula_type: CreditFormulaType;
  interest_rate_monthly_pct: number;
  rounding_unit: number;
  late_fee_rate_pct?: number;
  min_installments?: number;
  max_installments?: number;
  default_frequency?: CreditFrequency;
  money_decimal_places?: number;
}

export interface CreditCalcInput {
  productsSubtotal: number;
  downPayment: number;
  installmentsCount: number;
  frequency?: CreditFrequency;
  settings: CreditSettingsInput;
}

export interface CreditCalcResult {
  productsSubtotal: number;
  interestAmount: number;
  totalCredit: number;
  downPayment: number;
  financedAmount: number;
  installmentsCount: number;
  installmentAmount: number;
  formulaSnapshot: CreditSettingsInput & { calculated_at: string };
}

function roundToUnit(value: number, unit: number, decimalPlaces = 2): number {
  const rounded = !unit || unit <= 0 ? value : Math.round(value / unit) * unit;
  const factor = 10 ** Math.max(0, Math.min(4, decimalPlaces));
  return Math.round((rounded + Number.EPSILON) * factor) / factor;
}

function roundToDecimals(value: number, decimalPlaces = 2): number {
  const factor = 10 ** Math.max(0, Math.min(4, decimalPlaces));
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateCredit(input: CreditCalcInput): CreditCalcResult {
  const { productsSubtotal, downPayment, installmentsCount, frequency = "mensual", settings } = input;
  // 0 cuotas = los abonos iniciales cubren el valor de los productos (sin plan).
  const n = Math.max(0, Math.floor(installmentsCount || 0));
  const rate = Number(settings.interest_rate_monthly_pct) || 0;
  const unit = Number(settings.rounding_unit) || 1;
  const decimalPlaces = Number(settings.money_decimal_places) || 0;
  const subtotal = Math.max(0, Number(productsSubtotal) || 0);
  const initial = Math.min(Math.max(0, Number(downPayment) || 0), subtotal);
  const financedMonths = n * (frequency === "semanal" ? 7 / 30 : frequency === "quincenal" ? 0.5 : 1);

  let interestAmount = 0;
  let totalCredit = subtotal;

  switch (settings.formula_type) {
    case "simple_markup":
      interestAmount = subtotal * (rate / 100) * financedMonths;
      totalCredit = subtotal + interestAmount;
      break;
    case "financed_balance": {
      const base = Math.max(0, subtotal - initial);
      interestAmount = base * (rate / 100) * financedMonths;
      totalCredit = subtotal + interestAmount;
      break;
    }
    case "cash_includes_interest":
    default:
      interestAmount = 0;
      totalCredit = subtotal;
      break;
  }

  totalCredit = roundToUnit(totalCredit, unit, decimalPlaces);
  interestAmount = Math.max(0, totalCredit - subtotal);
  const financedAmount = Math.max(0, totalCredit - initial);
  // La cuota es exactamente saldo ÷ cuotas (a los decimales configurados);
  // rounding_unit solo aplica al total. Si la división no es exacta, la última
  // cuota absorbe la diferencia (adjust_negocio_last_installment).
  const installmentAmount = n > 0 ? roundToDecimals(financedAmount / n, decimalPlaces) : 0;

  return {
    productsSubtotal: subtotal,
    interestAmount,
    totalCredit,
    downPayment: initial,
    financedAmount,
    installmentsCount: n,
    installmentAmount,
    formulaSnapshot: {
      ...settings,
      calculated_at: new Date().toISOString(),
    },
  };
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
