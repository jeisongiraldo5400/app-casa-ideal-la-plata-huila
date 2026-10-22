/**
 * «Últimas compras» de un producto en el móvil (propuesta 4, migración
 * 20261231650000, RPC `cost_product_purchases`).
 *
 * Solo para el perfil «costos» y con conexión: se pide al servidor al tocar el
 * botón y vive en la memoria de la tarjeta. NUNCA se guarda en el teléfono
 * (ni SQLite, ni stores persistidos, ni la cola sin señal).
 *
 * Módulo puro: lee la respuesta jsonb con tolerancia.
 */

/** El móvil muestra las 5 recepciones más recientes, en formato compacto. */
export const MOBILE_PURCHASES_LIMIT = 5;

export type ProductPurchaseRow = {
  entryId: string;
  createdAt: string | null;
  orderNumber: string | null;
  supplierName: string | null;
  supplierNit: string | null;
  warehouseName: string | null;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  receivedByName: string | null;
};

export type ProductPurchases = {
  lastUnitCost: number | null;
  avgUnitCost: number | null;
  minUnitCost: number | null;
  maxUnitCost: number | null;
  total: number;
  rows: ProductPurchaseRow[];
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export function parseProductPurchases(raw: unknown): ProductPurchases | null {
  const data = asObject(raw);
  if (!data) return null;
  const summary = asObject(data.summary) ?? {};
  const rows = (Array.isArray(data.rows) ? data.rows : [])
    .map((item): ProductPurchaseRow | null => {
      const row = asObject(item);
      const entryId = row ? str(row.entry_id) : null;
      if (!row || !entryId) return null;
      return {
        entryId,
        createdAt: str(row.created_at),
        orderNumber: str(row.order_number),
        supplierName: str(row.supplier_name),
        supplierNit: str(row.supplier_nit),
        warehouseName: str(row.warehouse_name),
        quantity: num(row.quantity) ?? 0,
        unitCost: num(row.unit_cost),
        totalCost: num(row.total_cost),
        receivedByName: str(row.received_by_name),
      };
    })
    .filter((row): row is ProductPurchaseRow => row !== null)
    .slice(0, MOBILE_PURCHASES_LIMIT);
  return {
    lastUnitCost: num(data.last_unit_cost),
    avgUnitCost: num(data.avg_unit_cost),
    minUnitCost: num(summary.min_unit_cost),
    maxUnitCost: num(summary.max_unit_cost),
    total: num(data.total) ?? rows.length,
    rows,
  };
}

/** «12 oct. 2026» en hora de Colombia, o «—». */
export function formatPurchaseDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** «Proveedor · NIT 900…» o «Sin proveedor». */
export function supplierLabel(row: Pick<ProductPurchaseRow, 'supplierName' | 'supplierNit'>): string {
  if (!row.supplierName) return 'Sin proveedor';
  return row.supplierNit ? `${row.supplierName} · NIT ${row.supplierNit}` : row.supplierName;
}
