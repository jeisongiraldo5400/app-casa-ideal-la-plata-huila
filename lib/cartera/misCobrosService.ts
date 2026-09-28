import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { loadReportSnapshot, saveReportSnapshot } from '@/lib/offline/repositories/offlineRepository';
import {
  countUnsentPagosLocal,
  fetchProfileNameFromLocal,
  loadMisCobrosFromLocal,
} from '@/lib/offline/repositories/misCobrosRepository';
import {
  cierreParam,
  filterLocalMisCobros,
  pagosScopeFor,
  type CarteraPagosScope,
  type MisCobroRow,
  type MisCobrosFilters,
  type MisCobrosMethodTotal,
  type MisCobrosPage,
  type MisCobrosSummary,
  type PagosViewer,
} from './misCobros';

/** Métodos marcados `is_cash`, guardados para separar el efectivo sin señal. */
export const CASH_METHODS_SNAPSHOT = 'mis-cobros:cash-method-ids';

/** Alguien que registró pagos dentro del alcance (`collectors` del RPC). */
export type CarteraPagosCollector = { id: string; full_name: string; count: number };

export type CarteraPagosPage = MisCobrosPage & {
  /** Alcance: el del servidor o, sin señal, el que dan los roles. */
  scope: CarteraPagosScope;
  /** Para «Registrado por». Vacío sin señal (se conserva el último conocido). */
  collectors: CarteraPagosCollector[];
};

export type CarteraPagosQuery = {
  filters: MisCobrosFilters;
  page: number;
  pageSize: number;
  viewer: PagosViewer;
  /** Estado de red de la app: sin red se va directo a lo guardado. */
  online: boolean;
};

/** Respuesta cruda de `list_cartera_payments` (20261231220000). */
export type CarteraPaymentsResponse = {
  scope?: string;
  summary?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  collectors?: unknown[];
  cash_method_ids?: string[];
};

/** Filtros de la vista → argumentos de `list_cartera_payments` (solo los usados). */
export function carteraPaymentsArgs(filters: MisCobrosFilters, page: number, pageSize: number) {
  return {
    p_date_from: filters.from || undefined,
    p_date_to: filters.to || undefined,
    p_payment_method_ids: filters.paymentMethodIds.length ? filters.paymentMethodIds : undefined,
    p_payment_site: filters.site || undefined,
    p_created_by: filters.createdBy?.id || undefined,
    p_search: filters.search.trim(),
    // El RPC acepta 'todos' | 'vigentes' | 'anulados'.
    p_receipt_status: filters.status,
    p_in_cierre: cierreParam(filters.inCierre) ?? undefined,
    p_page: page,
    p_page_size: pageSize,
  };
}

/** Una página cruda de `list_cartera_payments` (la usan la vista y el Excel). */
export async function requestCarteraPayments(
  filters: MisCobrosFilters,
  page: number,
  pageSize: number
): Promise<CarteraPaymentsResponse> {
  const { data, error } = await supabase.rpc('list_cartera_payments', carteraPaymentsArgs(filters, page, pageSize));
  if (error) throw new Error(error.message || 'No fue posible cargar los pagos');
  return (data || {}) as CarteraPaymentsResponse;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : toNumber(value);
}

function toScope(value: unknown, fallback: CarteraPagosScope): CarteraPagosScope {
  return value === 'todos' || value === 'cartera' || value === 'propios' ? value : fallback;
}

function mapServerRow(row: Record<string, unknown>): MisCobroRow {
  return {
    payment_id: String(row.payment_id),
    negocio_id: String(row.negocio_id),
    negocio_numero: toNumber(row.negocio_numero),
    customer_name: String(row.customer_name ?? 'Cliente'),
    customer_id_number: (row.customer_id_number as string | null) ?? null,
    installment_number: row.installment_number == null ? null : toNumber(row.installment_number),
    cuota_label: typeof row.cuota_label === 'string' ? row.cuota_label : null,
    paid_at: String(row.paid_at),
    amount: toNumber(row.amount),
    virtual_receipt_number: (row.virtual_receipt_number as string | null) ?? null,
    receipt_number: (row.receipt_number as string | null) ?? null,
    receipt_status: row.receipt_status === 'anulado' ? 'anulado' : 'emitido',
    payment_method_id: (row.payment_method_id as string | null) ?? null,
    payment_method_name: (row.payment_method_name as string | null) ?? null,
    payment_method_is_cash: row.payment_method_is_cash == null ? null : Boolean(row.payment_method_is_cash),
    payment_site: (row.payment_site as string | null) ?? null,
    payment_kind: (row.payment_kind as string | null) ?? null,
    cierre_numero: (row.cierre_numero as string | null) ?? null,
    local_state: null,
    created_by: (row.created_by as string | null) ?? null,
    created_by_name: (row.created_by_name as string | null) ?? null,
    gestor_cobro_name: (row.gestor_cobro_name as string | null) ?? null,
    remaining_balance: toNullableNumber(row.remaining_balance),
    remaining_after_payment: toNullableNumber(row.remaining_after_payment),
    support_path: (row.support_path as string | null) ?? null,
    discount_amount: toNullableNumber(row.discount_amount),
    discount_reason: (row.discount_reason as string | null) ?? null,
    expected_total: toNullableNumber(row.expected_total),
  };
}

function mapSummary(summary: Record<string, unknown> = {}): MisCobrosSummary {
  return {
    total_count: toNumber(summary.total_count),
    valid_count: toNumber(summary.valid_count),
    voided_count: toNumber(summary.voided_count),
    total_collected: toNumber(summary.total_collected),
    total_cash: toNumber(summary.total_cash),
    cash_count: toNumber(summary.cash_count),
    average_payment: summary.average_payment == null ? undefined : toNumber(summary.average_payment),
    total_discount: summary.total_discount == null ? undefined : toNumber(summary.total_discount),
    pronto_pago_count: summary.pronto_pago_count == null ? undefined : toNumber(summary.pronto_pago_count),
    total_voided: summary.total_voided == null ? undefined : toNumber(summary.total_voided),
    by_method: Array.isArray(summary.by_method) ? summary.by_method.map(mapMethodTotal) : undefined,
  };
}

export function mapMethodTotal(value: unknown): MisCobrosMethodTotal {
  const item = (value || {}) as Record<string, unknown>;
  return {
    payment_method_id: item.payment_method_id == null ? null : String(item.payment_method_id),
    payment_method_name: item.payment_method_name == null ? null : String(item.payment_method_name),
    is_cash: item.is_cash == null ? null : Boolean(item.is_cash),
    count: toNumber(item.count),
    total: toNumber(item.total),
    total_discount: toNumber(item.total_discount),
  };
}

function mapCollector(value: unknown): CarteraPagosCollector | null {
  const item = (value || {}) as Record<string, unknown>;
  if (item.id == null) return null;
  return { id: String(item.id), full_name: String(item.full_name ?? 'Sin nombre'), count: toNumber(item.count) };
}

async function fetchFromServer(query: CarteraPagosQuery): Promise<CarteraPagosPage> {
  const result = await requestCarteraPayments(query.filters, query.page, query.pageSize);
  if (Array.isArray(result.cash_method_ids)) {
    // Sin señal, el teléfono separa el efectivo con esta lista (el catálogo
    // local de métodos no trae `is_cash`). Un fallo al guardarla no es grave.
    void saveReportSnapshot(CASH_METHODS_SNAPSHOT, result.cash_method_ids).catch(() => undefined);
  }
  const unsentCount = await countUnsentPagosLocal().catch(() => 0);
  return {
    rows: (result.rows || []).map(mapServerRow),
    summary: mapSummary(result.summary),
    fromCache: false,
    cierreFilterIgnored: false,
    unsentCount,
    cashMethodIds: Array.isArray(result.cash_method_ids) ? result.cash_method_ids.map(String) : null,
    scope: toScope(result.scope, pagosScopeFor(query.viewer)),
    collectors: (result.collectors || []).map(mapCollector).filter((item): item is CarteraPagosCollector => item != null),
  };
}

async function fetchFromLocal(query: CarteraPagosQuery): Promise<CarteraPagosPage | null> {
  const rows = await loadMisCobrosFromLocal();
  if (!rows) return null;
  const snapshot = await loadReportSnapshot<string[]>(CASH_METHODS_SNAPSHOT).catch(() => null);
  const userName = query.viewer.userName || (await fetchProfileNameFromLocal(query.viewer.userId));
  const cashMethodIds = Array.isArray(snapshot?.payload) ? snapshot.payload : null;
  const result = filterLocalMisCobros(rows, query.filters, {
    viewer: { ...query.viewer, userName },
    cashMethodIds,
  });
  const start = Math.max(query.page - 1, 0) * query.pageSize;
  return {
    rows: result.rows.slice(start, start + query.pageSize),
    summary: result.summary,
    fromCache: true,
    cierreFilterIgnored: query.filters.inCierre !== 'todos',
    unsentCount: result.rows.filter((row) => row.local_state === 'pendiente').length,
    cashMethodIds,
    // La descarga v3 (20261205120000) no baja negocios cerrados ni anulados:
    // sus pagos no están en el teléfono. Se avisa en pantalla.
    closedNegociosMissing: true,
    scope: pagosScopeFor(query.viewer),
    collectors: [],
  };
}

/**
 * Una página de la vista «Pagos». Con red pregunta al servidor (que decide el
 * alcance por rol); sin red (o si la petición no llega) usa los pagos del
 * teléfono con los mismos filtros y el mismo alcance. Cualquier otro error del
 * servidor (rango inválido, sesión) se propaga.
 */
export async function fetchCarteraPagos(query: CarteraPagosQuery): Promise<CarteraPagosPage> {
  if (!query.online) {
    const local = await fetchFromLocal(query);
    if (local) return local;
  }
  try {
    return await fetchFromServer(query);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const local = await fetchFromLocal(query);
    if (!local) throw error;
    return local;
  }
}
