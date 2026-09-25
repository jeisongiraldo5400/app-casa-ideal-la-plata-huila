import {
  clearCarteraFilters,
  countActiveCarteraFilters,
  describeCarteraFilters,
  dueRangeError,
  duePresetRange,
  matchingDuePreset,
  normalizeCarteraSearch,
} from '../carteraFilters';
import type { CarteraQuery } from '../types';

const base: CarteraQuery = {
  filter: 'todas',
  search: '',
  days: 15,
  municipioId: '',
  sellerId: '',
  customerSellerId: '',
  paymentMethodId: '',
  gestorId: '',
  dueFrom: '',
  dueTo: '',
};

describe('rango de vencimiento', () => {
  it('acepta fechas pasadas y futuras, y cada extremo por separado', () => {
    expect(dueRangeError('2024-01-01', '2024-03-31')).toBeNull();
    expect(dueRangeError('2020-05-10', '')).toBeNull();
    expect(dueRangeError('', '2019-12-31')).toBeNull();
    expect(dueRangeError('2030-01-01', '2030-01-01')).toBeNull();
    expect(dueRangeError('', '')).toBeNull();
  });

  it('rechaza «Hasta» antes de «Desde» y fechas imposibles', () => {
    expect(dueRangeError('2026-09-10', '2026-09-01')).toMatch(/Hasta/);
    expect(dueRangeError('2026-02-30', '')).toMatch(/Desde/);
    expect(dueRangeError('', 'ayer')).toMatch(/Hasta/);
  });

  it('los atajos se calculan sobre la fecha local (semana de lunes a domingo)', () => {
    const today = new Date(2026, 8, 25); // jueves 25 de septiembre de 2026
    expect(duePresetRange('hoy', today)).toEqual({ dueFrom: '2026-09-25', dueTo: '2026-09-25' });
    expect(duePresetRange('semana', today)).toEqual({ dueFrom: '2026-09-21', dueTo: '2026-09-27' });
    expect(duePresetRange('mes', today)).toEqual({ dueFrom: '2026-09-01', dueTo: '2026-09-30' });
    expect(duePresetRange('mes_pasado', today)).toEqual({ dueFrom: '2026-08-01', dueTo: '2026-08-31' });
    expect(duePresetRange('mes_siguiente', today)).toEqual({ dueFrom: '2026-10-01', dueTo: '2026-10-31' });
    // Enero: el mes pasado es diciembre del año anterior.
    expect(duePresetRange('mes_pasado', new Date(2027, 0, 5))).toEqual({ dueFrom: '2026-12-01', dueTo: '2026-12-31' });
    // Domingo: la semana es la que termina ese día.
    expect(duePresetRange('semana', new Date(2026, 8, 27))).toEqual({ dueFrom: '2026-09-21', dueTo: '2026-09-27' });
  });

  it('reconoce el atajo que coincide con el rango', () => {
    const today = new Date(2026, 8, 25);
    expect(matchingDuePreset('2026-09-01', '2026-09-30', today)).toBe('mes');
    expect(matchingDuePreset('2026-09-01', '2026-09-29', today)).toBeNull();
    expect(matchingDuePreset('2026-09-01', '', today)).toBeNull();
  });
});

describe('contador y limpiar', () => {
  it('cuenta cada filtro una vez; la búsqueda y los días por defecto no cuentan', () => {
    expect(countActiveCarteraFilters({ ...base, search: '123' })).toBe(0);
    expect(
      countActiveCarteraFilters({
        ...base,
        filter: 'mora',
        municipioId: 'm',
        sellerId: 's',
        customerSellerId: 'c',
        paymentMethodId: 'p',
        gestorId: 'g',
        dueFrom: '2026-01-01',
        dueTo: '2026-01-31',
      })
    ).toBe(7);
    expect(countActiveCarteraFilters({ ...base, dueTo: '2026-01-31' })).toBe(1);
  });

  it('limpiar vuelve a los valores por defecto y conserva la búsqueda', () => {
    const dirty = { ...base, filter: 'vencidas' as const, municipioId: 'm', gestorId: 'g', dueFrom: '2025-01-01', search: '1023' };
    expect(clearCarteraFilters(dirty, base)).toEqual({ ...base, search: '1023' });
  });

  it('describe los filtros aplicados', () => {
    expect(describeCarteraFilters(base)).toBe('Todas las cuotas abiertas');
    expect(describeCarteraFilters({ ...base, filter: 'por_vencer', days: 7, gestorId: 'g', dueFrom: '2026-09-01', dueTo: '2026-09-30' })).toBe(
      'Por vencer en 7 días · Gestor filtrado · Vence del 01/09/2026 al 30/09/2026'
    );
    expect(describeCarteraFilters({ ...base, filter: 'pagadas', dueTo: '2026-01-31' })).toBe('Pagadas · Vence hasta el 31/01/2026');
  });
});

describe('normalizeCarteraSearch', () => {
  it('una cédula con puntos o espacios viaja como dígitos', () => {
    expect(normalizeCarteraSearch(' 1.023.456.789 ')).toBe('1023456789');
    expect(normalizeCarteraSearch('1 023 456')).toBe('1023456');
    expect(normalizeCarteraSearch('2026-0003')).toBe('20260003');
  });

  it('los nombres (y documentos con letras) viajan tal cual, recortados', () => {
    expect(normalizeCarteraSearch('  María José ')).toBe('María José');
    expect(normalizeCarteraSearch('PE123')).toBe('PE123');
    expect(normalizeCarteraSearch('')).toBe('');
    expect(normalizeCarteraSearch('...')).toBe('...');
  });
});
