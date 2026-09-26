/** Producto de un negocio tal como se muestra en la ficha del cliente. */
export type NegocioProductLine = {
  name: string;
  sku: string | null;
  quantity: number;
};

export type NegocioProductSourceRow = {
  negocioId: string;
  productName: string | null;
  productSku: string | null;
  description: string | null;
  quantity: number;
};

/**
 * Agrupa las líneas por negocio y suma las cantidades del mismo producto
 * (un negocio puede tener el mismo producto en dos bodegas). Mantiene el orden
 * en que llegaron.
 */
export function groupNegocioProducts(rows: readonly NegocioProductSourceRow[]): Map<string, NegocioProductLine[]> {
  const byNegocio = new Map<string, Map<string, NegocioProductLine>>();
  for (const row of rows) {
    const name = row.productName?.trim() || row.description?.trim() || 'Producto';
    const key = `${row.productSku || ''}|${name}`;
    const lines = byNegocio.get(row.negocioId) ?? new Map<string, NegocioProductLine>();
    const current = lines.get(key);
    if (current) current.quantity += row.quantity;
    else lines.set(key, { name, sku: row.productSku || null, quantity: row.quantity });
    byNegocio.set(row.negocioId, lines);
  }
  return new Map([...byNegocio].map(([negocioId, lines]) => [negocioId, [...lines.values()]]));
}

/** «2 × Colchón doble» (sin decimales innecesarios). */
export function formatNegocioProductLine(line: NegocioProductLine): string {
  const quantity = Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2);
  return `${quantity} × ${line.name}`;
}
