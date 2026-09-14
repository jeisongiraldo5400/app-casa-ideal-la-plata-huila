/**
 * Mismos casos que `frontend/src/lib/__tests__/moneyInput.test.ts` (web): la
 * regla de parseo debe ser idéntica en ambos clientes. Al final, los casos del
 * campo de React Native (`applyMoneyTextChange`), exclusivos del móvil.
 */
import {
  clampMoneyDecimals,
  formatMoneyParsed,
  moneyToCents,
  moneyValueToDraft,
  parseMoneyInput,
  parseMoneyText,
  roundMoney,
  sameMoneyValue,
  applyMoneyTextChange,
} from '../moneyInput';

const twoDecimals = { decimalPlaces: 2, maxIntegerDigits: 12 };
const integers = { decimalPlaces: 0, maxIntegerDigits: 12 };

describe('parseMoneyInput — regla de parseo', () => {
  it.each([
    // Las tres formas del caso H1 (cuota de 93.333,33)
    ['93.333,33', '93333.33'],
    ['93333,33', '93333.33'],
    ['93333.33', '93333.33'],
    // Miles con punto
    ['93.333', '93333'],
    ['1.500.000', '1500000'],
    ['1.500.000,5', '1500000.5'],
    // Formato con coma de miles y punto decimal
    ['1,500.50', '1500.50'],
    ['1,500,000', '1500000'],
    // Punto único que no es de miles → decimal
    ['12.5', '12.5'],
    ['1.5000', '15000'],
    ['93333.333', '93333.33'],
    // Símbolos, espacios y signo
    ['$ 1.500.000,00', '1500000.00'],
    ['-3', '3'],
    ['texto', ''],
    ['', ''],
    // Ceros y coma inicial
    ['0,05', '0.05'],
    [',5', '0.5'],
    ['000123', '123'],
  ])('%p → %p (2 decimales)', (input, expected) => {
    expect(parseMoneyInput(input, twoDecimals)).toBe(expected);
  });

  it('trunca (no redondea) los decimales sobrantes', () => {
    expect(parseMoneyInput('10,999', twoDecimals)).toBe('10.99');
  });

  it('sin decimales descarta la parte decimal en vez de sumarla a los enteros', () => {
    expect(parseMoneyInput('93333,33', integers)).toBe('93333');
    expect(parseMoneyInput('93333.33', integers)).toBe('93333');
    expect(parseMoneyInput('93.333,33', integers)).toBe('93333');
    expect(parseMoneyInput('$ 1.500.000,00', integers)).toBe('1500000');
  });

  it('corta la parte entera al máximo de dígitos', () => {
    expect(parseMoneyInput('123456', { decimalPlaces: 2, maxIntegerDigits: 4 })).toBe('1234');
  });
});

describe('formatMoneyParsed', () => {
  it('usa punto de miles y coma decimal, conservando la coma pendiente', () => {
    expect(formatMoneyParsed(parseMoneyText('93333,33', twoDecimals))).toBe('93.333,33');
    expect(formatMoneyParsed(parseMoneyText('93333,', twoDecimals))).toBe('93.333,');
    expect(formatMoneyParsed(parseMoneyText(',', twoDecimals))).toBe('0,');
    expect(formatMoneyParsed(parseMoneyText('', twoDecimals))).toBe('');
  });
});

describe('moneyValueToDraft', () => {
  it('convierte valores externos a texto editable', () => {
    expect(moneyValueToDraft('93333.33', twoDecimals)).toBe('93333,33');
    expect(moneyValueToDraft(93333.5, twoDecimals)).toBe('93333,50');
    expect(moneyValueToDraft('1500000', twoDecimals)).toBe('1500000');
    expect(moneyValueToDraft(1500.7, integers)).toBe('1500');
    expect(moneyValueToDraft('', twoDecimals)).toBe('');
    expect(moneyValueToDraft(-5, twoDecimals)).toBe('');
  });
});

describe('utilidades', () => {
  it('acota los decimales de la configuración a 0–2', () => {
    expect(clampMoneyDecimals(2)).toBe(2);
    expect(clampMoneyDecimals(4)).toBe(2);
    expect(clampMoneyDecimals(0)).toBe(0);
    expect(clampMoneyDecimals(undefined)).toBe(0);
  });

  it('compara montos numéricamente', () => {
    expect(sameMoneyValue('93333.30', 93333.3)).toBe(true);
    expect(sameMoneyValue('', '')).toBe(true);
    expect(sameMoneyValue('', '0')).toBe(false);
  });

  it('redondea y pasa a centavos sin ruido de coma flotante', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(93333.334)).toBe(93333.33);
    expect(moneyToCents(93333.33000000001)).toBe(9333333);
  });
});

const options = twoDecimals;

/** Simula teclear/borrar sobre el campo formateado, como lo hace `TextInput`. */
function typeKeys(keys: string, start = '', opts = options) {
  let display = start;
  for (const key of keys) {
    const next = key === '<' ? display.slice(0, -1) : `${display}${key}`;
    display = applyMoneyTextChange(display, next, opts).display;
  }
  return { display, raw: applyMoneyTextChange(display, display, opts).raw };
}

describe('applyMoneyTextChange — campo de React Native', () => {
  it('teclear 93333,33 pinta 93.333,33 y vale 93333.33', () => {
    expect(typeKeys('93333,33')).toEqual({ display: '93.333,33', raw: '93333.33' });
  });

  it('el punto del teclado decimal de Android también abre los centavos', () => {
    expect(typeKeys('93333.33')).toEqual({ display: '93.333,33', raw: '93333.33' });
    expect(typeKeys('1500000.5')).toEqual({ display: '1.500.000,5', raw: '1500000.5' });
  });

  it('los enteros se siguen formateando con puntos de miles', () => {
    expect(typeKeys('1500000')).toEqual({ display: '1.500.000', raw: '1500000' });
  });

  it('borrar un dígito no convierte el punto de miles en decimal', () => {
    expect(typeKeys('<', '93.333')).toEqual({ display: '9.333', raw: '9333' });
    expect(typeKeys('<', '1.000')).toEqual({ display: '100', raw: '100' });
    expect(typeKeys('<<', '93.333,33')).toEqual({ display: '93.333,', raw: '93333' });
    expect(typeKeys('<<<', '93.333,33')).toEqual({ display: '93.333', raw: '93333' });
  });

  it('ignora un segundo separador y los decimales de más', () => {
    expect(typeKeys(',5,.9', '10')).toEqual({ display: '10,59', raw: '10.59' });
    expect(typeKeys('999', '10,5')).toEqual({ display: '10,59', raw: '10.59' });
  });

  it('una coma inicial deja 0,', () => {
    expect(typeKeys(',05')).toEqual({ display: '0,05', raw: '0.05' });
  });

  it('sin decimales en la configuración ignora los separadores', () => {
    expect(typeKeys('93333,33', '', integers)).toEqual({ display: '9.333.333', raw: '9333333' });
    expect(typeKeys('.', '93.333', integers)).toEqual({ display: '93.333', raw: '93333' });
  });

  it.each([
    ['93.333,33', '93.333,33', '93333.33'],
    ['93333,33', '93.333,33', '93333.33'],
    ['93333.33', '93.333,33', '93333.33'],
    ['$ 1.500.000', '1.500.000', '1500000'],
  ])('pegar %p aplica la regla general', (pasted, display, raw) => {
    expect(applyMoneyTextChange('', pasted, options)).toEqual({ display, raw });
    expect(applyMoneyTextChange('12', pasted, options)).toEqual({ display, raw });
  });

  it('vaciar el campo deja el valor vacío', () => {
    expect(applyMoneyTextChange('1.500', '', options)).toEqual({ display: '', raw: '' });
  });
});
