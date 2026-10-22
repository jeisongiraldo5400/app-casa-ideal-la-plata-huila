/**
 * Relleno del valor unitario con el precio de venta del producto
 * (20261231730000). Reglas:
 * - Solo al agregar el producto; las líneas ya guardadas no cambian.
 * - Nunca pisa lo que el vendedor ya escribió (la respuesta puede llegar
 *   después de que empezó a escribir).
 * - Sin precio, el valor unitario queda vacío como antes.
 */

type PricedLine = {
  product_id: string;
  warehouse_id: string;
  unit_price: number;
};

/** Texto del campo «Valor unitario» tras conocer el precio sugerido. */
export function prefillUnitPriceText(
  current: string,
  price: number | null,
  format: (value: string) => string
): string {
  if (current.trim() !== '') return current;
  if (price === null || !(price > 0)) return current;
  return format(String(price));
}

/**
 * Pone el precio sugerido en la línea recién agregada (producto + bodega)
 * solo si sigue sin valor unitario. Devuelve el mismo arreglo si no cambia.
 */
export function applySalePriceToLine<T extends PricedLine>(
  items: T[],
  productId: string,
  warehouseId: string,
  price: number | null
): T[] {
  if (price === null || !(price > 0)) return items;
  let changed = false;
  const next = items.map((item) => {
    if (item.product_id !== productId || item.warehouse_id !== warehouseId) return item;
    if (item.unit_price > 0) return item;
    changed = true;
    return { ...item, unit_price: price };
  });
  return changed ? next : items;
}
