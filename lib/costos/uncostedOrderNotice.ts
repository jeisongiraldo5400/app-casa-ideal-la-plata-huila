/**
 * Aviso «Mercancía sin costo» (migración 20261231810000): llegó mercancía de
 * una orden de compra con productos sin costo. Solo le llega al perfil Costos.
 *
 * En el teléfono no se costea (eso se hace en la web, Costos → Costear
 * órdenes), así que el aviso abre una pantalla simple que lo explica.
 */

export const UNCOSTED_ORDER_ROUTE = '/costos/orden-sin-costo';

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** Ruta a abrir con los datos del aviso (orden y cuántos productos sin costo). */
export function buildUncostedOrderRoute(data: {
  order_number?: unknown;
  uncosted_count?: unknown;
}): string {
  const params: string[] = [];
  const orden = text(data.order_number);
  if (orden) params.push(`orden=${encodeURIComponent(orden)}`);
  const count = parseUncostedCount(data.uncosted_count);
  if (count != null) params.push(`productos=${count}`);
  return params.length ? `${UNCOSTED_ORDER_ROUTE}?${params.join('&')}` : UNCOSTED_ORDER_ROUTE;
}

/** Entero positivo o null (un parámetro raro no debe romper la pantalla). */
export function parseUncostedCount(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = typeof raw === 'number' ? raw : Number(text(raw));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Frase principal de la pantalla, en lenguaje llano. */
export function uncostedOrderMessage(orden: string | null | undefined, productos: number | null): string {
  const nombre = text(orden) || 'una orden de compra';
  const cuantos =
    productos == null ? 'productos sin costo' : productos === 1 ? '1 producto sin costo' : `${productos} productos sin costo`;
  return `Llegó mercancía de ${nombre === 'una orden de compra' ? nombre : `la orden ${nombre}`} con ${cuantos}.`;
}
