import { localDateValue } from '../localDate';

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
