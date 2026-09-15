/**
 * Cantidades de producto en la app: siempre unidades enteras.
 *
 * El servidor rechaza cantidades no enteras en negocios, órdenes, salidas y
 * entradas (`20261021120000_cantidades_enteras_en_ordenes`). Espejo de
 * `frontend/src/lib/quantityInput.ts`.
 *
 * ## Decisión: lo escrito no se corrige, se marca en rojo (QA 2026-09-14)
 *
 * Antes los campos quitaban todo lo que no fuera dígito (`replace(/\D/g, '')`)
 * o usaban `parseInt`: «1.5» terminaba en 15 (el punto desaparecía y el «5» se
 * pegaba al «1»), «1,5» en 15 y «1.000» en 1. Ahora:
 * - solo dígitos → cantidad entera;
 * - vacío → cada pantalla decide;
 * - cualquier otra cosa («1.5», «1,5», «1.000», «-3») → el texto queda visible
 *   con `WHOLE_QUANTITY_MESSAGE`, la cantidad pasa a 0 y no se puede agregar ni
 *   guardar hasta corregirlo.
 *
 * «1.000» también es inválido: en es-CO puede leerse como mil, así que no se
 * adivina ni 1000 ni 1.
 */

export const WHOLE_QUANTITY_MESSAGE = 'La cantidad debe ser un número entero';

export type WholeQuantityText =
  | { status: 'empty' }
  | { status: 'invalid'; error: string }
  | { status: 'whole'; value: number };

const DIGITS_ONLY = /^\d+$/;

/** Interpreta el texto de un campo de cantidad sin quitarle separadores ni caracteres. */
export function parseWholeQuantityText(text: string | null | undefined): WholeQuantityText {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return { status: 'empty' };
  if (DIGITS_ONLY.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isSafeInteger(value)) return { status: 'whole', value };
  }
  return { status: 'invalid', error: WHOLE_QUANTITY_MESSAGE };
}

/**
 * Cantidad que debe guardar el formulario para un texto: el entero escrito, o 0
 * si está vacío o no es entero (0 nunca es una cantidad válida para agregar).
 */
export function quantityFromText(parsed: WholeQuantityText): number {
  return parsed.status === 'whole' ? parsed.value : 0;
}

/**
 * Siguiente texto de un campo con borrador local cuando cambia la cantidad
 * desde fuera: un texto inválido se conserva (el usuario debe verlo y
 * corregirlo); uno que ya coincide, también; en lo demás manda la cantidad.
 */
export function syncQuantityDraft(previous: string, quantity: number): string {
  const parsed = parseWholeQuantityText(previous);
  if (parsed.status === 'invalid') return previous;
  if (parsed.status === 'whole' && parsed.value === quantity) return previous;
  if (parsed.status === 'empty' && quantity === 0) return previous;
  return String(quantity);
}
