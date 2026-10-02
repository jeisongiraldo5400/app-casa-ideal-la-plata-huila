/**
 * Historial de una bodega (`get_warehouse_history`): tipos de movimiento,
 * textos en español (los mismos de la web, `frontend/.../domain/warehouseHistory.ts`),
 * filtros simples por grupo y por rango de fechas. Reglas puras, sin React.
 */
import { bogotaDateValue } from '@/lib/localDate';
import type { StatusTone } from '@/components/ui/StatusChip';

export const WAREHOUSE_MOVEMENT_TYPES = [
  'entry',
  'entry_cancellation',
  'customer_return',
  'supplier_return',
  'supplier_return_reversal',
  'exit',
  'exit_cancellation',
  'transfer_in',
  'transfer_out',
  'transfer_reservation',
  'transfer_release',
  'transfer_dispatch',
  'transfer_receipt',
  'transfer_return',
  'transfer_write_off',
  'adjustment',
  'reservation',
  'reservation_release',
  'warehouse_change',
] as const;

export type WarehouseMovementType = (typeof WAREHOUSE_MOVEMENT_TYPES)[number];

export function isMovementType(value: unknown): value is WarehouseMovementType {
  return typeof value === 'string' && (WAREHOUSE_MOVEMENT_TYPES as readonly string[]).includes(value);
}

export const WAREHOUSE_MOVEMENT_LABEL: Record<WarehouseMovementType, string> = {
  entry: 'Entrada',
  entry_cancellation: 'Anulación de entrada',
  customer_return: 'Devolución de cliente',
  supplier_return: 'Devolución a proveedor',
  supplier_return_reversal: 'Reversión de devolución',
  exit: 'Salida',
  exit_cancellation: 'Anulación de salida',
  transfer_in: 'Traslado directo recibido',
  transfer_out: 'Traslado directo enviado',
  transfer_reservation: 'Separado para traslado',
  transfer_release: 'Liberado de traslado',
  transfer_dispatch: 'Traslado despachado',
  transfer_receipt: 'Traslado recibido',
  transfer_return: 'Devuelto de traslado',
  transfer_write_off: 'Baja en traslado',
  adjustment: 'Ajuste de stock',
  reservation: 'Separado para orden',
  reservation_release: 'Liberado de orden',
  warehouse_change: 'Cambio de la bodega',
};

export const WAREHOUSE_MOVEMENT_TONE: Record<WarehouseMovementType, StatusTone> = {
  entry: 'success',
  entry_cancellation: 'error',
  customer_return: 'success',
  supplier_return: 'warning',
  supplier_return_reversal: 'info',
  exit: 'error',
  exit_cancellation: 'info',
  transfer_in: 'success',
  transfer_out: 'warning',
  transfer_reservation: 'neutral',
  transfer_release: 'neutral',
  transfer_dispatch: 'warning',
  transfer_receipt: 'success',
  transfer_return: 'success',
  transfer_write_off: 'error',
  adjustment: 'info',
  reservation: 'neutral',
  reservation_release: 'neutral',
  warehouse_change: 'neutral',
};

/**
 * Tipos que no mueven existencias físicas: separar/liberar (órdenes y
 * traslados), los cambios de la bodega y la baja de un traslado (las unidades
 * ya habían salido con el despacho). Su cantidad no va en verde/rojo.
 */
const NON_PHYSICAL_TYPES: ReadonlySet<WarehouseMovementType> = new Set<WarehouseMovementType>([
  'reservation',
  'reservation_release',
  'transfer_reservation',
  'transfer_release',
  'transfer_write_off',
  'warehouse_change',
]);

export function movesPhysicalStock(type: WarehouseMovementType): boolean {
  return !NON_PHYSICAL_TYPES.has(type);
}

/** Filtro «Tipo» del historial (simple: un grupo o todos). */
export type HistoryTypeFilter = 'all' | 'entradas' | 'salidas' | 'devoluciones' | 'traslados' | 'ajustes' | 'separados';

export const HISTORY_TYPE_FILTERS: readonly { key: HistoryTypeFilter; label: string; types: WarehouseMovementType[] | null }[] = [
  { key: 'all', label: 'Todos', types: null },
  { key: 'entradas', label: 'Entradas', types: ['entry'] },
  { key: 'salidas', label: 'Salidas', types: ['exit'] },
  { key: 'devoluciones', label: 'Devoluciones', types: ['customer_return', 'supplier_return', 'supplier_return_reversal'] },
  {
    key: 'traslados',
    label: 'Traslados',
    types: ['transfer_dispatch', 'transfer_receipt', 'transfer_return', 'transfer_write_off', 'transfer_in', 'transfer_out'],
  },
  { key: 'ajustes', label: 'Ajustes y anulaciones', types: ['adjustment', 'entry_cancellation', 'exit_cancellation'] },
  { key: 'separados', label: 'Separados', types: ['reservation', 'reservation_release', 'transfer_reservation', 'transfer_release'] },
];

/** Tipos a enviar a la RPC; null = todos. */
export function movementTypesFor(filter: HistoryTypeFilter): WarehouseMovementType[] | null {
  return HISTORY_TYPE_FILTERS.find((item) => item.key === filter)?.types ?? null;
}

/** Rango de fechas opcional (presets: sin selector de fecha en el teléfono). */
export type HistoryDatePreset = 'all' | 'today' | '7d' | '30d' | 'month';

export const HISTORY_DATE_PRESETS: readonly { key: HistoryDatePreset; label: string }[] = [
  { key: 'all', label: 'Todas las fechas' },
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: 'month', label: 'Este mes' },
];

export type HistoryDateRange = { dateFrom: string | null; dateTo: string | null };

function shiftDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Días calendario de Bogotá (el servidor interpreta las fechas en America/Bogota). */
export function historyDateRange(preset: HistoryDatePreset, now: Date = new Date()): HistoryDateRange {
  const today = bogotaDateValue(now);
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case '7d':
      return { dateFrom: shiftDays(today, -6), dateTo: today };
    case '30d':
      return { dateFrom: shiftDays(today, -29), dateTo: today };
    case 'month':
      return { dateFrom: `${today.slice(0, 8)}01`, dateTo: today };
    default:
      return { dateFrom: null, dateTo: null };
  }
}

export const WAREHOUSE_DOCUMENT_LABEL: Record<'purchase_order' | 'delivery_order' | 'return' | 'transfer_order', string> = {
  purchase_order: 'Orden de compra',
  delivery_order: 'Orden de entrega',
  return: 'Devolución',
  transfer_order: 'Traslado',
};

/** Cantidades: enteras si lo son (el servidor manda numeric, p. ej. 3.00). */
export function formatUnits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(rounded);
}

/** Cantidad con signo explícito: «+3», «−2», «0». */
export function formatSignedQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value > 0) return `+${formatUnits(value)}`;
  if (value < 0) return `−${formatUnits(Math.abs(value))}`;
  return '0';
}

/** «Orden de entrega OE-123» / «Traslado TR-2026-0001»; null sin documento. */
export function documentText(row: {
  documentType: keyof typeof WAREHOUSE_DOCUMENT_LABEL | null;
  documentNumber: string | null;
}): string | null {
  if (!row.documentType && !row.documentNumber) return null;
  const label = row.documentType ? WAREHOUSE_DOCUMENT_LABEL[row.documentType] : 'Documento';
  return row.documentNumber ? `${label} ${row.documentNumber}` : label;
}
