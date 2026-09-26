/**
 * «Cobros»: los pagos de quien cobra, con filtros y totales. Dos alcances:
 * - «performed»: los que registró el cobrador (`list_my_collected_payments`);
 * - «portfolio»: los de los negocios que tiene asignados hoy como gestor de
 *   cobro, aunque los haya registrado otro (`get_collection_manager_payments`
 *   con `p_scope = 'portfolio'`). Solo con señal: el teléfono no sabe qué
 *   negocios estaban asignados a quién.
 *
 * Ambos RPC son de 20261204120000_mis_cobros. Sin señal se filtran los pagos guardados en el
 * teléfono con las mismas reglas; este módulo es puro (sin base de datos ni
 * red) para poder probarlo entero.
 */
import { bogotaDateValue } from '@/lib/localDate';
import { matchesDigits, matchesNormalized } from '@/lib/search/normalizeText';

export type MisCobrosStatus = 'todos' | 'vigentes' | 'anulados';
/** '' = todos; 'sin_registro' = pagos anteriores al dato del sitio. */
export type MisCobrosSite = '' | 'almacen' | 'app_movil' | 'sin_registro';
export type MisCobrosCierre = 'todos' | 'si' | 'no';
/** Registrados por el cobrador, o de su cartera asignada (ver arriba). */
export type MisCobrosScope = 'performed' | 'portfolio';

export type MisCobrosFilters = {
  /** YYYY-MM-DD, día de Bogotá; vacío = sin límite. Pasado o futuro. */
  from: string;
  to: string;
  /** Varios métodos a la vez; vacío = todos. */
  paymentMethodIds: string[];
  site: MisCobrosSite;
  status: MisCobrosStatus;
  inCierre: MisCobrosCierre;
  /** Cliente, cédula o número de negocio (sin tildes). */
  search: string;
};

export const DEFAULT_MIS_COBROS_FILTERS: MisCobrosFilters = {
  from: '',
  to: '',
  paymentMethodIds: [],
  site: '',
  status: 'todos',
  inCierre: 'todos',
  search: '',
};

/** Estado del pago en el teléfono; null = confirmado por el servidor. */
export type MisCobroLocalState = 'pendiente' | 'rechazado' | null;

export type MisCobroRow = {
  payment_id: string;
  negocio_id: string;
  negocio_numero: number;
  customer_name: string;
  customer_id_number: string | null;
  installment_number: number | null;
  paid_at: string;
  amount: number;
  virtual_receipt_number: string | null;
  receipt_number: string | null;
  receipt_status: 'emitido' | 'anulado';
  payment_method_id: string | null;
  payment_method_name: string | null;
  /** null = no se sabe (sin señal y sin la lista de métodos en efectivo). */
  payment_method_is_cash: boolean | null;
  payment_site: string | null;
  payment_kind: string | null;
  cierre_numero: string | null;
  local_state: MisCobroLocalState;
  /*
   * Solo en filas del servidor (los pagos del teléfono no los traen): quién
   * registró el pago, saldo del negocio, soporte y datos del pronto pago. Con
   * ellos se reimprime o se comparte el recibo.
   */
  created_by_name?: string | null;
  remaining_balance?: number | null;
  support_path?: string | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  expected_total?: number | null;
};

export type MisCobrosSummary = {
  total_count: number;
  valid_count: number;
  voided_count: number;
  /** Dinero de los pagos vigentes (los anulados y rechazados no suman). */
  total_collected: number;
  /** Solo métodos marcados como efectivo; null si no se puede saber. */
  total_cash: number | null;
  cash_count: number | null;
  /** Promedio por pago vigente; solo lo calcula el servidor. */
  average_payment?: number;
};

export type MisCobrosPage = {
  rows: MisCobroRow[];
  summary: MisCobrosSummary;
  /** true = pagos guardados en el teléfono (sin señal). */
  fromCache: boolean;
  /** Sin señal el teléfono no sabe qué pagos entraron a un cierre. */
  cierreFilterIgnored: boolean;
  /** Pagos del teléfono aún sin enviar (con señal no están en la lista). */
  unsentCount: number;
};

export const EMPTY_MIS_COBROS_SUMMARY: MisCobrosSummary = {
  total_count: 0,
  valid_count: 0,
  voided_count: 0,
  total_collected: 0,
  total_cash: 0,
  cash_count: 0,
};

/** Filtro «Cierre de recaudo» → `p_in_cierre` del RPC (null = todos). */
export function cierreParam(value: MisCobrosCierre): boolean | null {
  if (value === 'si') return true;
  if (value === 'no') return false;
  return null;
}

/** Cuántos filtros (además de la búsqueda) están activos, para el botón. */
export function countActiveMisCobrosFilters(filters: MisCobrosFilters): number {
  let count = 0;
  if (filters.from) count += 1;
  if (filters.to) count += 1;
  if (filters.paymentMethodIds.length) count += 1;
  if (filters.site) count += 1;
  if (filters.status !== 'todos') count += 1;
  if (filters.inCierre !== 'todos') count += 1;
  return count;
}

export type MisCobrosPreset = 'hoy' | 'semana' | 'mes' | 'mes_pasado';

/** Rangos rápidos en días de Bogotá: el total de «Mis cobros» de fecha a fecha. */
export function misCobrosPresetRange(preset: MisCobrosPreset, today = new Date()): { from: string; to: string } {
  const to = bogotaDateValue(today);
  if (preset === 'hoy') return { from: to, to };
  if (preset === 'semana') return { from: bogotaDateValue(new Date(today.getTime() - 6 * 86_400_000)), to };
  const year = Number(to.slice(0, 4));
  const month = Number(to.slice(5, 7));
  if (preset === 'mes') return { from: `${to.slice(0, 8)}01`, to };
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const mm = String(prevMonth).padStart(2, '0');
  return { from: `${prevYear}-${mm}-01`, to: `${prevYear}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** Qué atajo coincide con el rango puesto (para resaltarlo). */
export function matchingMisCobrosPreset(range: { from: string; to: string }, today = new Date()): MisCobrosPreset | null {
  for (const preset of ['hoy', 'semana', 'mes', 'mes_pasado'] as MisCobrosPreset[]) {
    const candidate = misCobrosPresetRange(preset, today);
    if (candidate.from === range.from && candidate.to === range.to) return preset;
  }
  return null;
}

export function misCobrosRangeError(filters: Pick<MisCobrosFilters, 'from' | 'to'>): string | null {
  if (filters.from && filters.to && filters.from > filters.to) {
    return 'La fecha inicial no puede ser posterior a la fecha final.';
  }
  return null;
}

/** Un pago guardado en el teléfono, con lo necesario para decidir de quién es. */
export type LocalMisCobro = Omit<MisCobroRow, 'payment_method_is_cash' | 'local_state' | 'cierre_numero'> & {
  created_by_name: string | null;
  /** sync_status local: 'synced' | 'pending' | 'rejected' | … */
  sync_status: string;
};

function localStateOf(syncStatus: string): MisCobroLocalState {
  if (syncStatus === 'synced') return null;
  if (syncStatus === 'rejected') return 'rechazado';
  return 'pendiente';
}

function paidDay(paidAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return paidAt;
  const parsed = new Date(paidAt);
  return Number.isNaN(parsed.getTime()) ? paidAt.slice(0, 10) : bogotaDateValue(parsed);
}

/**
 * Filtra los pagos del teléfono como lo haría el servidor.
 *
 * - De quién: sin señal el teléfono no guarda el id de quien registró el pago,
 *   solo su nombre (`created_by_name`, la misma convención del servidor). Los
 *   pagos aún sin enviar se registraron en este teléfono con la sesión actual:
 *   cuentan solo cuando se consultan los cobros propios.
 * - El filtro de cierre no se aplica: el teléfono no sabe qué entró a un cierre.
 * - Un pago rechazado por el servidor se lista (marcado) pero no suma.
 */
export function filterLocalMisCobros(
  rows: LocalMisCobro[],
  filters: MisCobrosFilters,
  options: { collectorName: string | null; isSelf: boolean; cashMethodIds: string[] | null }
): { rows: MisCobroRow[]; summary: MisCobrosSummary } {
  const name = (options.collectorName || '').trim();
  const cash = options.cashMethodIds ? new Set(options.cashMethodIds) : null;
  const methods = filters.paymentMethodIds.length ? new Set(filters.paymentMethodIds) : null;
  const term = filters.search.trim();

  const matched = rows
    .filter((row) => {
      const state = localStateOf(row.sync_status);
      if (state) return options.isSelf;
      return Boolean(name) && (row.created_by_name || '').trim() === name;
    })
    .filter((row) => {
      const day = paidDay(row.paid_at);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      return true;
    })
    .filter((row) => !methods || (row.payment_method_id != null && methods.has(row.payment_method_id)))
    .filter((row) => {
      if (!filters.site) return true;
      if (filters.site === 'sin_registro') return !row.payment_site;
      return row.payment_site === filters.site;
    })
    .filter((row) => {
      const voided = row.receipt_status === 'anulado';
      if (filters.status === 'vigentes') return !voided;
      if (filters.status === 'anulados') return voided;
      return true;
    })
    .filter(
      (row) =>
        !term ||
        matchesNormalized(term, row.customer_name, row.customer_id_number, String(row.negocio_numero)) ||
        matchesDigits(term, row.negocio_numero, row.customer_id_number)
    )
    .map<MisCobroRow>((row) => {
      const { created_by_name: _name, sync_status: syncStatus, ...rest } = row;
      return {
        ...rest,
        payment_method_is_cash: cash ? row.payment_method_id != null && cash.has(row.payment_method_id) : null,
        cierre_numero: null,
        local_state: localStateOf(syncStatus),
      };
    })
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.payment_id.localeCompare(a.payment_id));

  const counted = matched.filter((row) => row.receipt_status !== 'anulado' && row.local_state !== 'rechazado');
  const cashRows = cash ? counted.filter((row) => row.payment_method_is_cash) : null;
  return {
    rows: matched,
    summary: {
      total_count: matched.length,
      valid_count: counted.length,
      voided_count: matched.filter((row) => row.receipt_status === 'anulado').length,
      total_collected: sumAmounts(counted),
      total_cash: cashRows ? sumAmounts(cashRows) : null,
      cash_count: cashRows ? cashRows.length : null,
    },
  };
}

/** Suma a centavos para no arrastrar ruido de coma flotante. */
function sumAmounts(rows: { amount: number }[]): number {
  return rows.reduce((total, row) => total + Math.round(Number(row.amount || 0) * 100), 0) / 100;
}
