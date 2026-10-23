/**
 * Ayudas cortas («?») de los términos de costos y «Ganancia/Pérdida» en vez
 * de solo «margen». Copia del diccionario de la web
 * (`frontend/src/app/admin/costos/domain/ayudas.ts`): si cambia un texto,
 * cambiarlo en las dos. Puro, sin React. Por decisión del usuario ningún
 * texto propone un precio de venta.
 */
import { formatCOP } from '@/lib/creditCalculator';

export type CostHelpTerm =
  | 'costo_promedio'
  | 'ultimo_costo'
  | 'ganancia'
  | 'costo_fijado'
  | 'precio_venta'
  | 'inventario_valorizado'
  | 'rotacion'
  | 'dias_inventario'
  | 'mercancia_quieta'
  | 'margen_minimo'
  | 'aplicar_a_lo_recibido';

export const COST_HELP: Record<CostHelpTerm, string> = {
  costo_promedio: 'Lo que en promedio te costó cada unidad que tienes.',
  ultimo_costo: 'Lo que pagaste en la compra más reciente.',
  ganancia: 'Lo que ganas sobre el precio de venta.',
  costo_fijado: 'El costo guardado el día de la venta; no cambia aunque compres más caro después.',
  precio_venta: 'El precio al que se vende el producto; lo registra solo el perfil Costos.',
  inventario_valorizado: 'Lo que vale la mercancía que tienes en bodega, contada a lo que te costó.',
  rotacion: 'Cuántas veces se vendió lo que tienes en el período. Más alto = se vende más rápido.',
  dias_inventario: 'Para cuántos días alcanza lo que tienes si se sigue vendiendo al mismo ritmo.',
  mercancia_quieta: 'Productos con existencias que no se venden hace tiempo: plata parada en bodega.',
  margen_minimo: 'La ganancia más baja que aceptas en una venta; si queda por debajo, te llega un aviso.',
  aplicar_a_lo_recibido:
    'Cambia también el costo de lo que ya llegó de esta orden. Si no lo marcas, cada recepción conserva el costo con que llegó.',
};

export const COST_HELP_NAME: Record<CostHelpTerm, string> = {
  costo_promedio: 'Costo promedio',
  ultimo_costo: 'Último costo',
  ganancia: 'Ganancia',
  costo_fijado: 'Costo fijado',
  precio_venta: 'Precio de venta',
  inventario_valorizado: 'Inventario valorizado',
  rotacion: 'Rotación',
  dias_inventario: 'Días de inventario',
  mercancia_quieta: 'Mercancía quieta',
  margen_minimo: 'Margen mínimo',
  aplicar_a_lo_recibido: 'Aplicar a lo recibido',
};

const MINUS = '−';

/** «21 %», «−12 %», «12,5 %» (un decimal como máximo, signo menos tipográfico, sin «−0»). */
export function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  const text = rounded.toLocaleString('es-CO', { maximumFractionDigits: 1 });
  return `${value < 0 && rounded !== 0 ? MINUS : ''}${text} %`;
}

export type ProfitView = {
  label: 'Ganancia' | 'Pérdida' | null;
  /** «$ 250.000 (21 %)»; la pérdida en positivo con el % negativo. «—» sin dato. */
  value: string;
  /** «Ganancia: $ 250.000 (21 %)» / «Pérdida: $ 150.000 (−12 %)» / «—». */
  text: string;
  negative: boolean;
};

/** Margen en pesos y % → «Ganancia: …» o, si es negativo, «Pérdida: …». */
export function profitView(amount: number | null | undefined, pct?: number | null): ProfitView {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return { label: null, value: '—', text: '—', negative: false };
  }
  const negative = amount < 0 && Math.abs(amount) >= 0.005;
  const label = negative ? 'Pérdida' : 'Ganancia';
  const pctText = pct === null || pct === undefined || !Number.isFinite(pct) ? '' : ` (${formatSignedPct(pct)})`;
  const value = `${formatCOP(Math.abs(amount))}${pctText}`;
  return { label, value, text: `${label}: ${value}`, negative };
}

/** % de ganancia de un total sobre lo vendido con costo (costo + ganancia). */
export function profitPctOfCosted(cost: number | null | undefined, margin: number | null | undefined): number | null {
  if (cost === null || cost === undefined || margin === null || margin === undefined) return null;
  const sale = cost + margin;
  if (!Number.isFinite(sale) || sale <= 0) return null;
  return Math.round((margin / sale) * 10000) / 100;
}
