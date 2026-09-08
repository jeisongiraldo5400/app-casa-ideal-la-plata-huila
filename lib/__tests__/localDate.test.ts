import { bogotaDateValue, formatPaymentDateTime, localDateValue } from '../localDate';

describe('localDateValue', () => {
  it('formatea la fecha calendario local como YYYY-MM-DD', () => {
    expect(localDateValue(new Date(2026, 7, 4, 22, 30, 0))).toBe('2026-08-04');
  });

  it('usa componentes locales (no toISOString/UTC)', () => {
    const lateLocal = new Date(2026, 7, 4, 22, 0, 0);
    const expected = [
      lateLocal.getFullYear(),
      String(lateLocal.getMonth() + 1).padStart(2, '0'),
      String(lateLocal.getDate()).padStart(2, '0'),
    ].join('-');
    expect(localDateValue(lateLocal)).toBe(expected);
  });
});

describe('formatPaymentDateTime', () => {
  it('presenta el timestamp en hora Colombia', () => {
    expect(formatPaymentDateTime('2026-08-22T02:35:00.000Z')).toBe(
      '21/08/2026 9:35 p. m.'
    );
  });

  it('distingue las horas de la mañana', () => {
    expect(formatPaymentDateTime('2026-08-21T15:05:00.000Z')).toBe(
      '21/08/2026 10:05 a. m.'
    );
  });

  it('tolera pagos antiguos que solo tienen fecha', () => {
    expect(formatPaymentDateTime('2026-08-21')).toBe('21/08/2026');
  });
});

describe('bogotaDateValue', () => {
  it('da el día colombiano, no el de UTC', () => {
    // 7 de septiembre 19:55 en Bogotá ya es día 8 en UTC. El contrato se fecha
    // con el día en Colombia, que es el que vale en el documento.
    const instante = new Date('2026-09-08T00:55:00.000Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(bogotaDateValue(instante)).toBe('2026-09-07');
  });

  it('coincide con UTC durante el día', () => {
    expect(bogotaDateValue(new Date('2026-09-08T18:00:00.000Z'))).toBe('2026-09-08');
  });
});
