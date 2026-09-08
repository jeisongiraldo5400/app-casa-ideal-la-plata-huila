import { calculateCredit, type CreditSettingsInput } from '@/lib/creditCalculator';
import { buildNegocioCreditSummary } from '../negocioCreditSummary';

const settings: CreditSettingsInput = {
  formula_type: 'financed_balance',
  interest_rate_monthly_pct: 2,
  rounding_unit: 1000,
  money_decimal_places: 0,
};

describe('buildNegocioCreditSummary', () => {
  it('lista cada abono, el saldo y explica el redondeo de la cuota', () => {
    const schedule = [
      { amount: 200_000, due_date: '2026-09-11' },
      { amount: 300_000, due_date: '2026-09-03' },
    ];
    const calc = calculateCredit({
      productsSubtotal: 1_000_000,
      downPayment: 500_000,
      installmentsCount: 3,
      frequency: 'mensual',
      settings,
    });
    const summary = buildNegocioCreditSummary({
      calc,
      settings,
      schedule,
      frequency: 'mensual',
      firstDueDate: '2026-10-03',
    });

    expect(summary.downPayments).toEqual([
      { label: 'Cuota inicial', dueDate: '2026-09-03', amount: 300_000 },
      { label: 'Abono 2', dueDate: '2026-09-11', amount: 200_000 },
    ]);
    expect(summary.downPaymentTotal).toBe(500_000);
    // 500.000 * 2% * 3 meses = 30.000 de interés
    expect(summary.totalCredit).toBe(1_030_000);
    expect(summary.financedAmount).toBe(530_000);
    expect(summary.interestNote).toMatch(/2% mensual sobre el saldo después de abonos/);
    expect(summary.plan).not.toBeNull();
    // 530.000 / 3 = 176.666,67 -> 176.667 (sin redondear a miles); última = 530.000 - 2 * 176.667 = 176.666
    expect(summary.plan?.installmentAmount).toBe(176_667);
    expect(summary.plan?.lastInstallmentAmount).toBe(176_666);
    expect(summary.plan?.regularCount).toBe(2);
    expect(summary.plan?.calculation).toMatch(/÷ 3 cuotas/);
    expect(summary.plan?.frequencyLabel).toBe('mensuales');
  });

  it('sin ajuste todas las cuotas son iguales', () => {
    const calc = calculateCredit({
      productsSubtotal: 900_000,
      downPayment: 0,
      installmentsCount: 3,
      frequency: 'mensual',
      settings: { ...settings, interest_rate_monthly_pct: 0 },
    });
    const summary = buildNegocioCreditSummary({
      calc,
      settings: { ...settings, interest_rate_monthly_pct: 0 },
      schedule: [],
      frequency: 'mensual',
    });
    expect(summary.plan?.regularCount).toBe(3);
    expect(summary.interestNote).toMatch(/Sin interés/);
  });

  it('sin saldo por financiar no hay plan', () => {
    const schedule = [{ amount: 1_000_000, due_date: '2026-09-03' }];
    const calc = calculateCredit({
      productsSubtotal: 1_000_000,
      downPayment: 1_000_000,
      installmentsCount: 0,
      frequency: 'mensual',
      settings,
    });
    const summary = buildNegocioCreditSummary({ calc, settings, schedule, frequency: 'mensual' });
    expect(summary.plan).toBeNull();
    expect(summary.financedAmount).toBe(0);
    expect(summary.interestNote).toMatch(/no queda saldo/);
  });
});
