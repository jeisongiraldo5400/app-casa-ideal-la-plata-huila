import { parseCarteraDueParam } from '../carteraDeepLink';

describe('parseCarteraDueParam', () => {
  it('acepta una fecha YYYY-MM-DD válida', () => {
    expect(parseCarteraDueParam('2026-09-11')).toBe('2026-09-11');
    expect(parseCarteraDueParam(' 2026-09-11 ')).toBe('2026-09-11');
  });

  it('toma el primer valor cuando el router entrega una lista', () => {
    expect(parseCarteraDueParam(['2026-09-11', '2026-09-12'])).toBe('2026-09-11');
  });

  it('rechaza fechas imposibles en vez de desplazarlas', () => {
    expect(parseCarteraDueParam('2026-02-30')).toBeNull();
    expect(parseCarteraDueParam('2026-13-01')).toBeNull();
  });

  it('rechaza formatos distintos y valores que no son texto', () => {
    expect(parseCarteraDueParam('11/09/2026')).toBeNull();
    expect(parseCarteraDueParam('2026-09-11T00:00:00Z')).toBeNull();
    expect(parseCarteraDueParam('')).toBeNull();
    expect(parseCarteraDueParam(undefined)).toBeNull();
    expect(parseCarteraDueParam(null)).toBeNull();
    expect(parseCarteraDueParam(20260911)).toBeNull();
  });
});
