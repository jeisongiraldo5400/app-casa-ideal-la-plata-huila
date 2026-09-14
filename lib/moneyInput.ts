/**
 * Parseo y formato de montos escritos a mano en formato colombiano.
 *
 * Copia fiel de `frontend/src/lib/moneyInput.ts` (web): misma regla y mismos
 * casos de prueba, para que un pago de 93.333,33 se lea igual en ambos
 * clientes. Si cambias la regla, cámbiala en los dos.
 *
 * Valor "crudo": texto numérico canónico con punto decimal y sin separadores de
 * miles — "93333.33", "1500000", "" (vacío). `Number(raw)` siempre es válido.
 *
 * REGLA DE PARSEO (`parseMoneyText`):
 *  1. Se descarta todo lo que no sea dígito, "," o "." (símbolo $, espacios,
 *     letras, signo menos: no hay montos negativos).
 *  2. Si aparecen "," y ".", el que aparece de ÚLTIMO es el separador decimal y
 *     el otro es de miles: "93.333,33" → 93333.33; "1,500.50" → 1500.5.
 *  3. Solo ",": una coma es decimal ("93333,33" → 93333.33); varias comas son
 *     de miles ("1,500,000" → 1500000).
 *  4. Solo ".": varios puntos son de miles ("1.500.000" → 1500000). Un único
 *     punto es de miles si lo preceden 1–3 dígitos y lo siguen 3 o más
 *     ("93.333" → 93333); en cualquier otro caso es decimal
 *     ("93333.33" → 93333.33, "12.5" → 12.5).
 *  5. Los decimales que excedan `decimalPlaces` se TRUNCAN (no se redondean);
 *     con `decimalPlaces = 0` se descartan.
 *  6. Se quitan los ceros a la izquierda y la parte entera se corta a
 *     `maxIntegerDigits` dígitos.
 *
 * Exclusivo del móvil: `applyMoneyTextChange`, que interpreta cada tecla sobre
 * el texto ya formateado del campo (ver su documentación).
 */

/** Las columnas de dinero son `numeric(14,2)`: más de 2 decimales no se guardan. */
export const MAX_MONEY_DECIMALS = 2;

export interface MoneyInputOptions {
  decimalPlaces: number;
  maxIntegerDigits: number;
}

export interface ParsedMoneyText {
  /** Dígitos enteros sin ceros a la izquierda ("" si no hay). */
  integer: string;
  /** Dígitos decimales ya truncados a `decimalPlaces`. */
  decimals: string;
  /** Hay separador decimal efectivo (aunque aún no tenga dígitos detrás). */
  hasDecimalSeparator: boolean;
}

/** Acota `money_decimal_places` de la configuración al rango que admite la BD. */
export function clampMoneyDecimals(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_MONEY_DECIMALS);
}

export function sanitizeMoneyText(text: string): string {
  return String(text ?? '').replace(/[^\d,.]/g, '');
}

function count(text: string, char: string) {
  return text.split(char).length - 1;
}

/** Índice del separador decimal según la regla documentada arriba, o -1. */
function decimalSeparatorIndex(text: string): number {
  const commas = count(text, ',');
  const dots = count(text, '.');
  if (commas > 0 && dots > 0) return Math.max(text.lastIndexOf(','), text.lastIndexOf('.'));
  if (commas === 1) return text.indexOf(',');
  if (commas > 1) return -1;
  if (dots === 1) {
    const index = text.indexOf('.');
    const before = text.slice(0, index).replace(/\D/g, '').length;
    const after = text.slice(index + 1).replace(/\D/g, '').length;
    const looksLikeThousands = before >= 1 && before <= 3 && after >= 3;
    return looksLikeThousands ? -1 : index;
  }
  return -1;
}

function normalizeDecimalPlaces(value: number) {
  return Math.max(0, Math.trunc(value) || 0);
}

export function parseMoneyText(text: string, options: MoneyInputOptions): ParsedMoneyText {
  const clean = sanitizeMoneyText(text);
  const decimalPlaces = normalizeDecimalPlaces(options.decimalPlaces);
  const separator = decimalSeparatorIndex(clean);
  const integerText = separator >= 0 ? clean.slice(0, separator) : clean;
  const integer = integerText
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, options.maxIntegerDigits);
  const decimals =
    separator >= 0 && decimalPlaces > 0
      ? clean.slice(separator + 1).replace(/\D/g, '').slice(0, decimalPlaces)
      : '';
  return {
    integer,
    decimals,
    hasDecimalSeparator: separator >= 0 && decimalPlaces > 0,
  };
}

/** Valor crudo canónico ("93333.33"); "" si no hay ningún dígito. */
export function moneyParsedToRaw(parsed: ParsedMoneyText): string {
  if (!parsed.integer && !parsed.decimals) return '';
  const integer = parsed.integer || '0';
  return parsed.decimals ? `${integer}.${parsed.decimals}` : integer;
}

/** Atajo: texto libre → valor crudo canónico. */
export function parseMoneyInput(text: string, options: MoneyInputOptions): string {
  return moneyParsedToRaw(parseMoneyText(text, options));
}

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "93333,3" → "93.333,3"; conserva la coma pendiente ("93.333,"). */
export function formatMoneyParsed(parsed: ParsedMoneyText): string {
  if (!parsed.integer && !parsed.hasDecimalSeparator) return '';
  const integer = groupThousands(parsed.integer || '0');
  return parsed.hasDecimalSeparator ? `${integer},${parsed.decimals}` : integer;
}

/**
 * Texto editable (sin separadores de miles, coma decimal) para un valor que
 * llega de fuera del campo: número o crudo canónico. Los decimales se
 * rellenan a `decimalPlaces` ("93333.5" → "93333,50") y se omiten si son cero.
 */
export function moneyValueToDraft(value: string | number | null | undefined, options: MoneyInputOptions): string {
  if (value === '' || value === null || value === undefined) return '';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return '';
  const decimalPlaces = normalizeDecimalPlaces(options.decimalPlaces);
  if (decimalPlaces === 0) {
    return String(Math.trunc(numericValue)).slice(0, options.maxIntegerDigits);
  }
  const [integer, fraction = ''] = numericValue.toFixed(decimalPlaces).split('.');
  const cutInteger = integer.slice(0, options.maxIntegerDigits);
  return /^0*$/.test(fraction) ? cutInteger : `${cutInteger},${fraction}`;
}

/** Igualdad numérica de dos valores de dinero ("" solo es igual a ""). */
export function sameMoneyValue(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const emptyA = a === '' || a === null || a === undefined;
  const emptyB = b === '' || b === null || b === undefined;
  if (emptyA || emptyB) return emptyA === emptyB;
  return Number(a) === Number(b);
}

/** Redondea a centavos (u otra precisión) evitando el ruido de coma flotante. */
export function roundMoney(value: number, decimalPlaces: number = MAX_MONEY_DECIMALS): number {
  const factor = 10 ** Math.max(0, Math.min(4, Math.trunc(decimalPlaces)));
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

/** Monto en centavos enteros, para comparar sin error de coma flotante. */
export function moneyToCents(value: number): number {
  return Math.round(Number(value) * 100);
}

export interface MoneyTextChange {
  /** Texto a pintar en el campo: "93.333,33", "93.333," o "". */
  display: string;
  /** Valor crudo canónico ("93333.33") o "" si no hay valor. */
  raw: string;
}

function fromDisplayFormat(text: string, options: MoneyInputOptions): MoneyTextChange {
  // El texto del campo siempre usa "." de miles y "," decimal: quitados los
  // puntos, una coma solo puede ser el separador decimal.
  const parsed = parseMoneyText(sanitizeMoneyText(text).replace(/\./g, ''), options);
  return { display: formatMoneyParsed(parsed), raw: moneyParsedToRaw(parsed) };
}

/**
 * Siguiente estado de un campo de dinero de React Native a partir del texto
 * que pintaba (`previousDisplay`, siempre formateado por esta función) y del
 * que entrega `onChangeText`.
 *
 * `TextInput` no expone la tecla pulsada, sino el texto completo; y el campo ya
 * muestra puntos de miles, así que aplicar la regla general a cada cambio
 * falla: borrar un dígito de "93.333" deja "93.33" (se leería 93,33) y un "."
 * tecleado tras "93.333" se leería como otro separador de miles (el teclado
 * decimal de Android solo trae punto). Por eso:
 *  - Una tecla añadida al final (el cursor está fijo al final): un dígito se
 *    suma al valor; "," o "." abre los decimales si aún no hay coma y se
 *    admiten decimales (si no, se ignora).
 *  - Un carácter borrado del final: se relee en formato de campo (los puntos
 *    son de miles).
 *  - Cualquier otro cambio (pegar, autocompletar, reemplazar todo): se aplica
 *    la regla general de `parseMoneyText`, así «93.333,33», «93333,33» y
 *    «93333.33» pegados valen 93333.33.
 */
export function applyMoneyTextChange(
  previousDisplay: string,
  nextText: string,
  options: MoneyInputOptions
): MoneyTextChange {
  const previous = previousDisplay ?? '';
  const next = nextText ?? '';
  const decimalPlaces = normalizeDecimalPlaces(options.decimalPlaces);

  if (next.length === previous.length + 1 && next.startsWith(previous)) {
    const key = next.slice(-1);
    if (key === ',' || key === '.') {
      if (decimalPlaces === 0 || previous.includes(',')) return fromDisplayFormat(previous, options);
      return fromDisplayFormat(`${previous},`, options);
    }
    if (/^\d$/.test(key)) return fromDisplayFormat(next, options);
    return fromDisplayFormat(previous, options);
  }

  if (next.length === previous.length - 1 && previous.startsWith(next)) {
    return fromDisplayFormat(next, options);
  }

  const parsed = parseMoneyText(next, options);
  return { display: formatMoneyParsed(parsed), raw: moneyParsedToRaw(parsed) };
}
