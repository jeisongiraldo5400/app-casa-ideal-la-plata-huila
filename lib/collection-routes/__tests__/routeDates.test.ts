import { addDaysToDateValue, defaultRouteDate, routeDateError, routeDateLabel, takenRouteDates } from '../routeDates';

describe('routeDates', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDaysToDateValue('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDateValue('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('una ruta cancelada no ocupa el día', () => {
    const taken = takenRouteDates([
      { route_date: '2026-09-25', status: 'activa' },
      { route_date: '2026-09-26', status: 'cancelada' },
    ]);
    expect([...taken]).toEqual(['2026-09-25']);
  });

  it('abre en hoy; si hoy tiene ruta, en el primer día libre; respeta la fecha pedida si es válida', () => {
    expect(defaultRouteDate('2026-09-25', new Set())).toBe('2026-09-25');
    expect(defaultRouteDate('2026-09-25', new Set(['2026-09-25', '2026-09-26']))).toBe('2026-09-27');
    expect(defaultRouteDate('2026-09-25', new Set(), '2026-09-28')).toBe('2026-09-28');
    expect(defaultRouteDate('2026-09-25', new Set(), '2026-09-20')).toBe('2026-09-25');
    expect(defaultRouteDate('2026-09-25', new Set(['2026-09-26']), '2026-09-26')).toBe('2026-09-25');
  });

  it('etiquetas y errores', () => {
    expect(routeDateLabel('2026-09-25', '2026-09-25')).toBe('hoy');
    expect(routeDateLabel('2026-09-26', '2026-09-25')).toBe('mañana');
    expect(routeDateLabel('2026-09-30', '2026-09-25')).toMatch(/^el 30/);
    expect(routeDateError('2026-09-24', '2026-09-25', new Set())).toMatch(/pasado/);
    expect(routeDateError('2026-09-25', '2026-09-25', new Set(['2026-09-25']))).toMatch(/Ya tienes una ruta para hoy/);
    expect(routeDateError('2026-09-26', '2026-09-25', new Set())).toBeNull();
  });
});
