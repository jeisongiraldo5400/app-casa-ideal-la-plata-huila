/**
 * Reglas puras de «Enviar productos».
 *
 * En producción, cuatro de las cinco ediciones tenían un único producto: el
 * vendedor quería mandarle UN producto a un cliente y para eso montaba una
 * edición entera a mano. Ahora se hace en un paso, reutilizando la misma
 * maquinaria de ediciones y enlaces (nada nuevo en el servidor ni en la
 * revista que ve el cliente). Desde 2026-09-29 se pueden elegir varios.
 */

import { TITLE_MAX } from '@/lib/catalogos/validators';

/** Prefijo que distingue estas ediciones en la lista del vendedor (web y móvil). */
export const QUICK_SHARE_PREFIX = 'Envío rápido · ';

/**
 * Tope de productos por envío. Cada ficha se resuelve al congelar la edición
 * (RPC por lote de hasta 200 slugs), así que 30 es holgado para el servidor y
 * sigue siendo un mensaje que el cliente alcanza a mirar.
 */
export const QUICK_SHARE_MAX_PRODUCTS = 30;

/** Nombres que se citan en el título antes de resumir con «y N más». */
const NAMES_IN_TITLE = 2;

function truncate(value: string): string {
  return value.length > TITLE_MAX ? `${value.slice(0, TITLE_MAX - 1).trimEnd()}…` : value;
}

function cleanName(name: string): string {
  return name.trim() || 'Producto';
}

/**
 * Título interno de la edición de un producto suelto. Es también la clave
 * para reutilizarla: si el vendedor vuelve a mandar el mismo producto, se usa
 * la edición que ya tiene en vez de crear otra igual.
 */
export function quickShareTitle(productName: string): string {
  return truncate(`${QUICK_SHARE_PREFIX}${cleanName(productName)}`);
}

/** «Nevera 250, Armario 120 y 3 más». */
export function summarizeProductNames(names: readonly string[]): string {
  const cleaned = names.map(cleanName);
  const shown = cleaned.slice(0, NAMES_IN_TITLE);
  const rest = cleaned.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} y ${rest} más`;
  if (shown.length <= 1) return shown[0] ?? 'Producto';
  return `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`;
}

/**
 * Títulos de la edición de varios productos. El interno lleva el prefijo (así
 * web y móvil la pliegan con los envíos rápidos) y la cantidad; el público es
 * lo que el cliente ve en la portada. El mismo conjunto, en el mismo orden,
 * da el mismo título: es la clave para reutilizar la edición.
 */
export function quickShareBundleTitles(productNames: readonly string[]): { internalTitle: string; publicTitle: string } {
  const summary = summarizeProductNames(productNames);
  return {
    internalTitle: truncate(`${QUICK_SHARE_PREFIX}${productNames.length} productos: ${summary}`),
    publicTitle: truncate(summary),
  };
}

/** `true` si la edición es de las creadas por «Enviar productos». */
export function isQuickShareCatalog(internalTitle: string | null | undefined): boolean {
  return (internalTitle ?? '').startsWith(QUICK_SHARE_PREFIX);
}

export type ToggleSelectionResult<T> = {
  selection: T[];
  /** Se intentó añadir con la selección llena: no se añadió. */
  limitReached: boolean;
};

/**
 * Añade o quita un producto de la selección. La selección es independiente de
 * la página y de la búsqueda: guarda las fichas elegidas, no índices.
 */
export function toggleProductSelection<T extends { productId: string }>(
  selection: readonly T[],
  item: T,
  max: number = QUICK_SHARE_MAX_PRODUCTS
): ToggleSelectionResult<T> {
  if (selection.some((entry) => entry.productId === item.productId)) {
    return { selection: selection.filter((entry) => entry.productId !== item.productId), limitReached: false };
  }
  if (selection.length >= max) return { selection: [...selection], limitReached: true };
  return { selection: [...selection, item], limitReached: false };
}
