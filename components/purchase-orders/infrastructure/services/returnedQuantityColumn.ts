import { createOptionalColumnGate } from '@/lib/optionalColumn';

/**
 * `delivery_order_items.returned_quantity` llega con la migración
 * «devolución cierra línea OE». Mientras no esté aplicada, cualquier `select`
 * que la nombre revienta con `42703`, así que todas las consultas de líneas de
 * orden pasan por esta compuerta compartida: se intenta una vez con la columna
 * y, si la base todavía no la tiene, se repite sin ella y se da 0 por devuelto.
 *
 * La compuerta es única para toda la app a propósito: basta un fallo para que
 * ninguna pantalla vuelva a pedirla hasta el siguiente arranque.
 */
export const returnedQuantityGate = createOptionalColumnGate();

/** Añade `returned_quantity` a un `select` cuando la base ya la tiene. */
export function withReturnedQuantity(select: string, withColumn: boolean): string {
  return withColumn ? `${select}, returned_quantity` : select;
}

/** Lo devuelto de una fila: 0 si la columna no existe o llega nula. */
export function readReturnedQuantity(row: unknown): number {
  if (!row || typeof row !== 'object') return 0;
  return Number((row as { returned_quantity?: number | string | null }).returned_quantity) || 0;
}
