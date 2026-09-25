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
  type MisCobroRow,
  type MisCobrosFilters,
  type MisCobrosPage,
  type MisCobrosSummary,
} from './misCobros';

/** Métodos marcados `is_cash`, guardados para separar el efectivo sin señal. */
export const CASH_METHODS_SNAPSHOT = 'mis-cobros:cash-method-ids';

export type MisCobrosQuery = {
  filters: MisCobrosFilters;
  page: number;
  pageSize: number;
  /** Id del cobrador consultado; el propio cuando `isSelf`. */
  collectorId: string;
  /** Nombre visible del cobrador (para reconocer sus pagos sin señal). */
  collectorName: string | null;
  isSelf: boolean;
  /** Estado de red de la app: sin red se va directo a lo guardado. */
  online: boolean;
};

type RpcResult = {
  summary?: Partial<Record<keyof MisCobrosSummary, number | string | null>>;
  rows?: Record<string, unknown>[];
  cash_method_ids?: string[];
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapServerRow(row: Record<string, unknown>): MisCobroRow {
  return {
    payment_id: String(row.payment_id),
    negocio_id: String(row.negocio_id),
    negocio_numero: toNumber(row.negocio_numero),
    customer_name: String(row.customer_name ?? 'Cliente'),
    customer_id_number: (row.customer_id_number as string | null) ?? null,
    installment_number: row.installment_number == null ? null : toNumber(row.installment_number),
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
  };
}

async function fetchFromServer(query: MisCobrosQuery): Promise<MisCobrosPage> {
  const { filters } = query;
  const { data, error } = await supabase.rpc('list_my_collected_payments', {
    // El propio va como NULL: el servidor usa la sesión (auth.uid()).
    p_collector_id: query.isSelf ? undefined : query.collectorId,
    p_from: filters.from || undefined,
    p_to: filters.to || undefined,
    p_payment_method_ids: filters.paymentMethodIds.length ? filters.paymentMethodIds : undefined,
    p_payment_site: filters.site || undefined,
    p_status: filters.status,
    p_in_cierre: cierreParam(filters.inCierre) ?? undefined,
    p_search: filters.search.trim(),
    p_page: query.page,
    p_page_size: query.pageSize,
  });
  if (error) throw new Error(error.message || 'No fue posible cargar los cobros');
  const result = (data || {}) as RpcResult;
  const summary = result.summary || {};
  if (Array.isArray(result.cash_method_ids)) {
    // Sin señal, el teléfono separa el efectivo con esta lista (el catálogo
    // local de métodos no trae `is_cash`). Un fallo al guardarla no es grave.
    void saveReportSnapshot(CASH_METHODS_SNAPSHOT, result.cash_method_ids).catch(() => undefined);
  }
  const unsentCount = query.isSelf ? await countUnsentPagosLocal().catch(() => 0) : 0;
  return {
    rows: (result.rows || []).map(mapServerRow),
    summary: {
      total_count: toNumber(summary.total_count),
      valid_count: toNumber(summary.valid_count),
      voided_count: toNumber(summary.voided_count),
      total_collected: toNumber(summary.total_collected),
      total_cash: toNumber(summary.total_cash),
      cash_count: toNumber(summary.cash_count),
    },
    fromCache: false,
    cierreFilterIgnored: false,
    unsentCount,
  };
}

async function fetchFromLocal(query: MisCobrosQuery): Promise<MisCobrosPage | null> {
  const rows = await loadMisCobrosFromLocal();
  if (!rows) return null;
  const snapshot = await loadReportSnapshot<string[]>(CASH_METHODS_SNAPSHOT);
  const collectorName =
    query.collectorName || (await fetchProfileNameFromLocal(query.collectorId));
  const result = filterLocalMisCobros(rows, query.filters, {
    collectorName,
    isSelf: query.isSelf,
    cashMethodIds: Array.isArray(snapshot?.payload) ? snapshot.payload : null,
  });
  const start = Math.max(query.page - 1, 0) * query.pageSize;
  return {
    rows: result.rows.slice(start, start + query.pageSize),
    summary: result.summary,
    fromCache: true,
    cierreFilterIgnored: query.filters.inCierre !== 'todos',
    unsentCount: result.rows.filter((row) => row.local_state === 'pendiente').length,
  };
}

/**
 * Una página de «Mis cobros». Con red pregunta al servidor; sin red (o si la
 * petición no llega) usa los pagos del teléfono con los mismos filtros.
 * Cualquier otro error del servidor (permiso, rango inválido) se propaga.
 */
export async function fetchMisCobros(query: MisCobrosQuery): Promise<MisCobrosPage> {
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

