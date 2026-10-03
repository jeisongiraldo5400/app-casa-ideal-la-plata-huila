import { calculateCredit, formatCOP, type CreditSettingsInput } from '../creditCalculator';

const settings: CreditSettingsInput = {
  formula_type: 'cash_includes_interest',
  interest_rate_monthly_pct: 0,
  rounding_unit: 1,
  money_decimal_places: 2,
  min_installments: 1,
  max_installments: 3,
};

describe('calculateCredit mobile/web parity', () => {
  it('acepta las cuotas definidas por el vendedor sin aplicar el máximo configurado', () => {
    const result = calculateCredit({
      productsSubtotal: 1_200_000,
      downPayment: 0,
      installmentsCount: 48,
      settings,
    });
    expect(result.installmentsCount).toBe(48);
    expect(result.installmentAmount).toBe(25_000);
  });

  it('incluye y aplica los decimales monetarios usados por la web y la base de datos', () => {
    const result = calculateCredit({
      productsSubtotal: 100,
      downPayment: 0,
      installmentsCount: 3,
      settings: { ...settings, rounding_unit: 0.01 },
    });
    expect(result.installmentAmount).toBe(33.33);
    expect(result.formulaSnapshot.money_decimal_places).toBe(2);
  });

  it('calcula interés semanal por su duración equivalente en meses', () => {
    const result = calculateCredit({
      productsSubtotal: 100_000,
      downPayment: 0,
      installmentsCount: 12,
      frequency: 'semanal',
      settings: { ...settings, formula_type: 'simple_markup', interest_rate_monthly_pct: 1 },
    });
    expect(result.totalCredit).toBe(102_800);
  });
});

describe('calculateCredit con interés manual', () => {
  const pct: CreditSettingsInput = {
    formula_type: 'financed_balance',
    interest_rate_monthly_pct: 2,
    rounding_unit: 1000,
    money_decimal_places: 0,
  };

  it('con interés manual 0 da exactamente lo mismo que sin él', () => {
    for (const formula_type of ['financed_balance', 'simple_markup', 'cash_includes_interest'] as const) {
      const base = { productsSubtotal: 1_234_567, downPayment: 300_000, installmentsCount: 7, settings: { ...pct, formula_type } };
      const { formulaSnapshot: a, ...sinManual } = calculateCredit(base);
      const { formulaSnapshot: b, ...conCero } = calculateCredit({ ...base, manualInterest: 0 });
      expect(conCero).toEqual(sinManual);
      expect(sinManual.manualInterestAmount).toBe(0);
      expect(a.formula_type).toBe(b.formula_type);
    }
  });

  it('suma el interés manual al total redondeado, sin redondearlo', () => {
    const result = calculateCredit({
      productsSubtotal: 1_000_000,
      downPayment: 0,
      installmentsCount: 3,
      settings: { ...pct, interest_rate_monthly_pct: 0 },
      manualInterest: 150_555,
    });
    expect(result.totalCredit).toBe(1_150_555);
    expect(result.interestAmount).toBe(150_555);
    expect(result.manualInterestAmount).toBe(150_555);
    expect(result.financedAmount).toBe(1_150_555);
    expect(result.installmentAmount).toBe(383_518);
  });

  it('la base del porcentaje sigue siendo los productos menos los abonos que caen sobre ellos', () => {
    const result = calculateCredit({
      productsSubtotal: 1_000_000,
      downPayment: 500_000,
      installmentsCount: 3,
      settings: pct,
      manualInterest: 100_000,
    });
    // 500.000 × 2% × 3 = 30.000 → 1.030.000 + 100.000 manual
    expect(result.totalCredit).toBe(1_130_000);
    expect(result.interestAmount).toBe(130_000);
    expect(result.financedAmount).toBe(630_000);
  });

  it('los abonos pueden cubrir productos + interés manual, y no más', () => {
    const result = calculateCredit({
      productsSubtotal: 1_000_000,
      downPayment: 2_000_000,
      installmentsCount: 0,
      settings: pct,
      manualInterest: 100_000,
    });
    expect(result.downPayment).toBe(1_100_000);
    expect(result.totalCredit).toBe(1_100_000);
    expect(result.financedAmount).toBe(0);
  });

  it('un interés negativo cuenta como 0', () => {
    const result = calculateCredit({
      productsSubtotal: 900_000,
      downPayment: 0,
      installmentsCount: 3,
      settings: { ...pct, interest_rate_monthly_pct: 0 },
      manualInterest: -50_000,
    });
    expect(result.totalCredit).toBe(900_000);
    expect(result.manualInterestAmount).toBe(0);
  });
});

describe('formatCOP', () => {
  it('omite los centavos en montos redondos', () => {
    expect(formatCOP(800000)).toContain('800.000');
    expect(formatCOP(800000)).not.toContain(',00');
  });

  it('conserva los centavos cuando existen, para que el plan sume el saldo', () => {
    // 12 cuotas de 66.666,67 y una última de 66.666,63 suman 800.000 exactos.
    // Redondeadas a pesos el contrato imprimía 800.004.
    const cuota = 66666.67;
    expect(formatCOP(cuota)).toContain('66.666,67');
    const impreso = 11 * cuota + 66666.63;
    expect(Math.round(impreso * 100) / 100).toBe(800000);
  });

  it('ignora el ruido de coma flotante', () => {
    expect(formatCOP(800000.0000000001)).not.toContain(',00');
  });

  it('respeta los decimales pedidos explícitamente', () => {
    expect(formatCOP(1000, 2)).toContain('1.000,00');
  });
});
