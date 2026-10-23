import {
  costAlertLevel,
  costAlertText,
  formatMarginPct,
  parseNegocioCostResult,
} from '../negocioCosts';

const line = (overrides: Record<string, unknown> = {}) => ({
  product_id: 'p-1',
  quantity: 2,
  unit_price: 90,
  last_unit_cost: 100,
  avg_unit_cost: 100,
  unit_cost: 100,
  cost_total: 200,
  margin_amount: -20,
  margin_pct: -11.11,
  below_cost: true,
  below_margin: false,
  ...overrides,
});

describe('parseNegocioCostResult', () => {
  it('sin live ni totales: costo de hoy', () => {
    const result = parseNegocioCostResult({ min_margin_pct: 10, lines: [line()] });
    expect(result?.minMarginPct).toBe(10);
    expect(result?.totals).toBeNull();
    expect(result?.lines[0]).toMatchObject({
      productId: 'p-1', quantity: 2, unitPrice: 90, unitCost: 100, marginAmount: -20, belowCost: true, live: true,
    });
  });

  it('lee el detalle con la foto fijada y los totales', () => {
    const result = parseNegocioCostResult({
      min_margin_pct: null,
      lines: [line({ live: false, product_name: 'Nevera' })],
      totals: { sale: 440, cost: 400, margin_amount: -10, lines_without_cost: 1 },
    });
    expect(result?.minMarginPct).toBeNull();
    expect(result?.lines[0].live).toBe(false);
    expect(result?.lines[0].productName).toBe('Nevera');
    expect(result?.totals).toEqual({ sale: 440, cost: 400, marginAmount: -10, linesWithoutCost: 1 });
  });

  it('una línea sin costo queda con costos en null', () => {
    const result = parseNegocioCostResult({
      lines: [line({ last_unit_cost: null, avg_unit_cost: null, unit_cost: null, margin_amount: null, margin_pct: null, below_cost: false })],
    });
    expect(result?.lines[0]).toMatchObject({ unitCost: null, marginPct: null, belowCost: false });
  });

  it('respuestas corruptas no lanzan', () => {
    expect(parseNegocioCostResult(null)).toBeNull();
    expect(parseNegocioCostResult('x')).toBeNull();
    expect(parseNegocioCostResult({ lines: 'x' })).toBeNull();
    expect(parseNegocioCostResult({ lines: [null, { quantity: 1 }, line()] })?.lines).toHaveLength(1);
  });
});

describe('alertas', () => {
  it('bajo costo manda sobre bajo margen', () => {
    expect(costAlertLevel({ belowCost: true, belowMargin: true })).toBe('bajo_costo');
    expect(costAlertLevel({ belowCost: false, belowMargin: true })).toBe('bajo_margen');
    expect(costAlertLevel({ belowCost: false, belowMargin: false })).toBeNull();
  });

  it('textos llanos, con el margen mínimo cuando se conoce', () => {
    const parsed = parseNegocioCostResult({ lines: [line(), line({ below_cost: false, below_margin: true }), line({ below_cost: false })] })!;
    expect(costAlertText(parsed.lines[0], 10)).toBe('Por debajo del costo');
    expect(costAlertText(parsed.lines[1], 10)).toBe('Margen bajo (mínimo 10 %)');
    expect(costAlertText(parsed.lines[1], null)).toBe('Margen bajo');
    expect(costAlertText(parsed.lines[2], 10)).toBeNull();
  });

  it('formatea el margen en porcentaje', () => {
    expect(formatMarginPct(null)).toBe('—');
    expect(formatMarginPct(4.76)).toBe('4,8 %');
    expect(formatMarginPct(-11.11)).toBe('-11,1 %');
    expect(formatMarginPct(20)).toBe('20 %');
  });
});
