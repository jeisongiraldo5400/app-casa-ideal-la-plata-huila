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
}

export interface CreditCalcInput {
  productsSubtotal: number;
  downPayment: number;
  installmentsCount: number;
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

function roundToUnit(value: number, unit: number): number {
  if (!unit || unit <= 0) return Math.round(value);
  return Math.round(value / unit) * unit;
}

export function calculateCredit(input: CreditCalcInput): CreditCalcResult {
  const { productsSubtotal, downPayment, installmentsCount, settings } = input;
  const n = Math.max(1, Math.floor(installmentsCount || 1));
  const rate = Number(settings.interest_rate_monthly_pct) || 0;
  const unit = Number(settings.rounding_unit) || 1;
  const subtotal = Math.max(0, Number(productsSubtotal) || 0);
  const initial = Math.min(Math.max(0, Number(downPayment) || 0), subtotal);

  let interestAmount = 0;
  let totalCredit = subtotal;

  switch (settings.formula_type) {
    case "simple_markup":
      interestAmount = subtotal * (rate / 100) * n;
      totalCredit = subtotal + interestAmount;
      break;
    case "financed_balance": {
      const base = Math.max(0, subtotal - initial);
      interestAmount = base * (rate / 100) * n;
      totalCredit = subtotal + interestAmount;
      break;
    }
    case "cash_includes_interest":
    default:
      interestAmount = 0;
      totalCredit = subtotal;
      break;
  }

  totalCredit = roundToUnit(totalCredit, unit);
  interestAmount = Math.max(0, totalCredit - subtotal);
  const financedAmount = Math.max(0, totalCredit - initial);
  const installmentAmount = roundToUnit(n > 0 ? financedAmount / n : financedAmount, unit);

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
