import { COST_HELP, COST_HELP_NAME, formatSignedPct, profitPctOfCosted, profitView } from '../costHelp';

const plain = (text: string) => text.replace(/ /g, ' ');

describe('ayudas «?» de costos (móvil)', () => {
  it('textos aprobados, mismos términos que la web y sin sugerir precios', () => {
    expect(COST_HELP.costo_promedio).toBe('Lo que en promedio te costó cada unidad que tienes.');
    expect(COST_HELP.ultimo_costo).toBe('Lo que pagaste en la compra más reciente.');
    expect(COST_HELP.ganancia).toBe('Lo que ganas sobre el precio de venta.');
    expect(COST_HELP.costo_fijado).toBe('El costo guardado el día de la venta; no cambia aunque compres más caro después.');
    expect(Object.keys(COST_HELP_NAME).sort()).toEqual(Object.keys(COST_HELP).sort());
    for (const text of Object.values(COST_HELP)) {
      expect(text).not.toMatch(/precio de referencia|sugerid|debería/i);
    }
  });
});

describe('Ganancia / Pérdida (móvil)', () => {
  it('ganancia con el % al lado', () => {
    const view = profitView(250000, 21);
    expect(view.label).toBe('Ganancia');
    expect(plain(view.text)).toBe('Ganancia: $ 250.000 (21 %)');
  });

  it('pérdida en positivo con el % negativo', () => {
    const view = profitView(-150000, -12);
    expect(view.negative).toBe(true);
    expect(plain(view.text)).toBe('Pérdida: $ 150.000 (−12 %)');
  });

  it('sin dato y sin %', () => {
    expect(profitView(null, 5)).toEqual({ label: null, value: '—', text: '—', negative: false });
    expect(plain(profitView(0).text)).toBe('Ganancia: $ 0');
  });

  it('% firmado y % de un total sobre lo costeado', () => {
    expect(formatSignedPct(-11.11)).toBe('−11,1 %');
    expect(formatSignedPct(-0.01)).toBe('0 %');
    expect(formatSignedPct(null)).toBe('—');
    expect(profitPctOfCosted(800, 200)).toBe(20);
    expect(profitPctOfCosted(100, -10)).toBe(-11.11);
    expect(profitPctOfCosted(null, 1)).toBeNull();
  });
});
