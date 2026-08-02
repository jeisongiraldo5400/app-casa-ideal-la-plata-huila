import { supabase } from '@/lib/supabase';
import { cacheActiveRoute } from './routeCache';
import {
  CandidateFilter,
  CollectionRoute,
  CollectionRouteCandidate,
  CollectionRouteSummary,
  StopStatus,
} from './types';

const asNumber = (value: unknown) => Number(value || 0);

export async function fetchRouteCandidates(params: {
  search: string;
  filter: CandidateFilter;
  municipioId?: string;
  page: number;
  pageSize: number;
}) {
  const { data, error } = await (supabase.rpc as any)('get_collection_route_candidates', {
    p_search: params.search,
    p_filter: params.filter,
    p_municipio_id: params.municipioId || null,
    p_page: params.page,
    p_page_size: params.pageSize,
  });
  if (error) throw new Error(error.message || 'No fue posible buscar los negocios');
  const rows = (data || []).map((row: any): CollectionRouteCandidate => ({
    ...row,
    negocio_numero: asNumber(row.negocio_numero),
    expected_balance: asNumber(row.expected_balance),
    overdue_balance: asNumber(row.overdue_balance),
    open_installments: asNumber(row.open_installments),
    total_count: asNumber(row.total_count),
  }));
  return { rows, totalCount: rows[0]?.total_count || 0 };
}

export async function createCollectionRoute(negocioIds: string[], routeDate: string) {
  const { data, error } = await (supabase.rpc as any)('create_collection_route', {
    p_negocio_ids: negocioIds,
    p_route_date: routeDate,
  });
  if (error) throw new Error(error.message || 'No fue posible crear la ruta');
  return data as string;
}

export async function fetchMyCollectionRoutes() {
  const { data, error } = await (supabase.rpc as any)('get_my_collection_routes', { p_limit: 20 });
  if (error) throw new Error(error.message || 'No fue posible cargar las rutas');
  return (data || []).map((row: any): CollectionRouteSummary => ({
    ...row,
    stop_count: asNumber(row.stop_count),
    completed_count: asNumber(row.completed_count),
    expected_total: asNumber(row.expected_total),
    collected_total: asNumber(row.collected_total),
  }));
}

export async function fetchCollectionRoute(routeId: string) {
  const { data, error } = await (supabase.rpc as any)('get_collection_route', { p_route_id: routeId });
  if (error) throw new Error(error.message || 'No fue posible cargar la ruta');
  const raw = data as any;
  const route: CollectionRoute = {
    ...raw,
    total_expected: asNumber(raw.total_expected),
    total_collected: asNumber(raw.total_collected),
    stops: (raw.stops || []).map((stop: any) => ({
      ...stop,
      negocio_numero: asNumber(stop.negocio_numero),
      position: asNumber(stop.position),
      expected_balance: asNumber(stop.expected_balance),
      payment_amount: stop.payment_amount == null ? null : asNumber(stop.payment_amount),
    })),
  };
  await cacheActiveRoute(route);
  return route;
}

export async function startCollectionRoute(routeId: string) {
  const { error } = await (supabase.rpc as any)('start_collection_route', { p_route_id: routeId });
  if (error) throw new Error(error.message || 'No fue posible iniciar la ruta');
}

export async function updateCollectionRouteStop(
  stopId: string,
  status: Extract<StopStatus, 'sin_pago' | 'reprogramado' | 'omitido'>,
  reason: string,
  notes?: string,
) {
  const { error } = await (supabase.rpc as any)('update_collection_route_stop', {
    p_stop_id: stopId,
    p_status: status,
    p_reason: reason,
    p_notes: notes || null,
  });
  if (error) throw new Error(error.message || 'No fue posible actualizar la parada');
}

export async function finishCollectionRoute(routeId: string, cancel = false) {
  const { error } = await (supabase.rpc as any)('finish_collection_route', {
    p_route_id: routeId,
    p_cancel: cancel,
  });
  if (error) throw new Error(error.message || 'No fue posible finalizar la ruta');
}

