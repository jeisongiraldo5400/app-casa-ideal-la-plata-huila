/**
 * Reglas puras de «Enviar un producto».
 *
 * En producción, cuatro de las cinco ediciones tenían un único producto: el
 * vendedor quería mandarle UN producto a un cliente y para eso montaba una
 * edición entera a mano. Ahora se hace en un paso, reutilizando la misma
 * maquinaria de ediciones y enlaces (nada nuevo en el servidor ni en la
 * revista que ve el cliente).
 */

import { TITLE_MAX } from '@/lib/catalogos/validators';

/** Prefijo que distingue estas ediciones en la lista del vendedor. */
export const QUICK_SHARE_PREFIX = 'Envío rápido · ';

/**
 * Título interno de la edición de un producto suelto. Es también la clave
 * para reutilizarla: si el vendedor vuelve a mandar el mismo producto, se usa
 * la edición que ya tiene en vez de crear otra igual.
 */
export function quickShareTitle(productName: string): string {
  const name = productName.trim() || 'Producto';
  const title = `${QUICK_SHARE_PREFIX}${name}`;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title;
}

/** `true` si la edición es de las creadas por «Enviar un producto». */
export function isQuickShareCatalog(internalTitle: string | null | undefined): boolean {
  return (internalTitle ?? '').startsWith(QUICK_SHARE_PREFIX);
}
