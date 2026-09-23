import { matchesDigits, matchesNormalized, normalizeDigits, normalizeText } from '../normalizeText';

describe('normalizeText', () => {
  it('quita tildes, baja a minúsculas y recorta', () => {
    expect(normalizeText('  Álvaro MUÑOZ  ')).toBe('alvaro munoz');
    expect(normalizeText('José Gutiérrez')).toBe('jose gutierrez');
  });

  it('con vacío o nulo devuelve cadena vacía', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('matchesNormalized', () => {
  it('encuentra con tilde y sin tilde, en los dos sentidos', () => {
    expect(matchesNormalized('munoz', 'MUÑOZ RAMÍREZ')).toBe(true);
    expect(matchesNormalized('MUÑOZ', 'Munoz Ramirez')).toBe(true);
  });

  it('un término vacío no filtra', () => {
    expect(matchesNormalized('', 'lo que sea')).toBe(true);
    expect(matchesNormalized('   ', null)).toBe(true);
  });

  it('busca en varios textos y tolera nulos', () => {
    expect(matchesNormalized('ana', null, undefined, 'Ana Pérez')).toBe(true);
    expect(matchesNormalized('luis', 'Ana Pérez', null)).toBe(false);
  });
});

describe('normalizeDigits y matchesDigits', () => {
  it('se queda con los dígitos', () => {
    expect(normalizeDigits('2026-0003')).toBe('20260003');
    expect(normalizeDigits('1.023.456.789')).toBe('1023456789');
    expect(normalizeDigits('sin numeros')).toBe('');
  });

  it('compara números escritos con separadores', () => {
    expect(matchesDigits('2026-0003', 20260003)).toBe(true);
    expect(matchesDigits('0003', 20260003)).toBe(true);
    expect(matchesDigits('1.023.456.789', '1023456789')).toBe(true);
  });

  it('sin dígitos en el término devuelve false, para que el llamador siga probando con el texto', () => {
    expect(matchesDigits('munoz', 20260003)).toBe(false);
    expect(matchesDigits('', 20260003)).toBe(false);
  });
});
