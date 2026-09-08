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
