/**
 * Normalización de texto para buscar, igual en toda la app.
 *
 * Espejo de `public.norm_text` en Postgres (minúsculas, sin tildes, sin
 * espacios en los extremos). Quien busca no sabe —ni tiene por qué saber— si
 * el nombre se guardó «Muñoz» o «Munoz», «José» o «Jose»: en el ensayo, con
 * 161 clientes con tilde, buscar «MUNOZ» devolvía cero de 57.
 *
 * Los buscadores que preguntan al servidor ya lo resuelven allí
 * (migraciones 20261116120000 y 20261117120000). Este módulo es para los que
 * filtran dentro del teléfono: listas ya descargadas y el modo sin conexión.
 */

/** Minúsculas, sin tildes y sin espacios en los extremos. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * `true` si el término aparece en alguno de los textos, sin distinguir tildes
 * ni mayúsculas. Un término vacío no filtra nada.
 */
export function matchesNormalized(term: string | null | undefined, ...haystacks: Array<string | null | undefined>): boolean {
  const needle = normalizeText(term);
  if (!needle) return true;
  return haystacks.some((value) => normalizeText(value).includes(needle));
}

/**
 * Dígitos del término, o cadena vacía si no tiene ninguno. Sirve para comparar
 * números escritos con separadores: «2026-0003» y «20260003» son lo mismo, y
 * una cédula «1.023.456.789» encuentra a quien la tiene guardada sin puntos.
 */
export function normalizeDigits(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * `true` si los dígitos del término aparecen en los dígitos del valor. Sólo
 * cuando el término trae dígitos; si no, devuelve false para que el llamador
 * siga probando con las comparaciones de texto.
 */
export function matchesDigits(term: string | null | undefined, ...values: Array<string | number | null | undefined>): boolean {
  const needle = normalizeDigits(term);
  if (!needle) return false;
  return values.some((value) => {
    const digits = normalizeDigits(value == null ? '' : String(value));
    return digits.length > 0 && digits.includes(needle);
  });
}
