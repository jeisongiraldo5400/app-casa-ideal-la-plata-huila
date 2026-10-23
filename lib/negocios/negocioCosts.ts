/**
 * Costo y margen por línea de negocio (perfil «costos», migración
 * 20261231620000).
 *
 * Solo lo ve quien tiene el perfil «costos»: ni admin ni vendedor, y solo en la
 * pantalla del aviso de costos (nunca al crear, editar o ver un negocio). Se
 * pide siempre al servidor (`cost_get_negocio`) y NUNCA se guarda en el
 * teléfono: ni SQLite, ni almacenamiento persistido, ni la cola sin señal. Sin
 * conexión no se muestra nada.
 *
 * Este módulo es puro (sin React ni Supabase): lee las respuestas jsonb con
 * tolerancia y decide la alerta de cada línea.
 */

export type CostAlertLevel = 'bajo_costo' | 'bajo_margen' | null;

export type NegocioCostLine = {
  productId: string;
  productName: string | null;
  quantity: number;
  unitPrice: number;
  lastUnitCost: number | null;
  avgUnitCost: number | null;
  /** Costo con el que se calcula el margen: promedio, o el último si aún no hay promedio. */
  unitCost: number | null;
  costTotal: number | null;
  marginAmount: number | null;
  marginPct: number | null;
  belowCost: boolean;
  belowMargin: boolean;
  /** false = costo fijado al activar el negocio; true = costo vigente hoy. */
  live: boolean;
};

export type NegocioCostTotals = {
  sale: number | null;
  cost: number | null;
  marginAmount: number | null;
  linesWithoutCost: number;
};

export type NegocioCostResult = {
  minMarginPct: number | null;
  lines: NegocioCostLine[];
  totals: NegocioCostTotals | null;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function parseLine(raw: unknown): NegocioCostLine | null {
  const row = asObject(raw);
  if (!row) return null;
  const productId = str(row.product_id);
  if (!productId) return null;
  return {
    productId,
    productName: str(row.product_name),
    quantity: num(row.quantity) ?? 0,
    unitPrice: num(row.unit_price) ?? 0,
    lastUnitCost: num(row.last_unit_cost),
    avgUnitCost: num(row.avg_unit_cost),
    unitCost: num(row.unit_cost),
    costTotal: num(row.cost_total),
    marginAmount: num(row.margin_amount),
    marginPct: num(row.margin_pct),
    belowCost: row.below_cost === true,
    belowMargin: row.below_margin === true,
    live: row.live === undefined ? true : row.live === true,
  };
}

/** Lee la respuesta de `cost_get_negocio`. Nunca lanza. */
export function parseNegocioCostResult(data: unknown): NegocioCostResult | null {
  const root = asObject(data);
  if (!root || !Array.isArray(root.lines)) return null;
  const lines = root.lines.map(parseLine).filter((line): line is NegocioCostLine => line !== null);
  const totalsRaw = asObject(root.totals);
  return {
    minMarginPct: num(root.min_margin_pct),
    lines,
    totals: totalsRaw
      ? {
          sale: num(totalsRaw.sale),
          cost: num(totalsRaw.cost),
          marginAmount: num(totalsRaw.margin_amount),
          linesWithoutCost: num(totalsRaw.lines_without_cost) ?? 0,
        }
      : null,
  };
}

/** Rojo si se vende por debajo del costo; ámbar si queda bajo el margen mínimo. */
export function costAlertLevel(line: Pick<NegocioCostLine, 'belowCost' | 'belowMargin'>): CostAlertLevel {
  if (line.belowCost) return 'bajo_costo';
  if (line.belowMargin) return 'bajo_margen';
  return null;
}

/** «12,5 %», «-4 %» o «—». */
export function formatMarginPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

/** Texto de la alerta de una línea, o null. */
export function costAlertText(line: NegocioCostLine, minMarginPct: number | null): string | null {
  const level = costAlertLevel(line);
  if (level === 'bajo_costo') return 'Por debajo del costo';
  if (level === 'bajo_margen') {
    return minMarginPct === null ? 'Margen bajo' : `Margen bajo (mínimo ${formatMarginPct(minMarginPct)})`;
  }
  return null;
}
