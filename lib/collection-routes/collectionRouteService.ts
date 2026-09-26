import { supabase } from '@/lib/supabase';
import { cacheActiveRoute, getCachedActiveRoute } from './routeCache';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  enqueueRouteCommand,
  fetchRouteFromLocal,
  fetchRoutesFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import {
  fetchRouteCandidatesFromLocal,
  readRouteLocalSnapshot,
  saveRouteCopyLocally,
} from '@/lib/offline/repositories/routesRepository';
import { requestManualDownload } from '@/lib/offline/sync/downloadData';
import { lastManualDownloadAt } from '@/lib/offline/sync/syncPrefs';
import { bogotaDateValue } from '@/lib/localDate';
import { MAX_ROUTE_STOPS } from './candidates';
import { evaluateRouteOfflineStatus, type RouteOfflineStatus } from './routeOffline';
import { isVisitedStopStatus } from './routeState';
import {
  CandidateQuery,
  CollectionRoute,
  CollectionRouteCandidate,
  CollectionRouteSummary,
  StopStatus,
} from './types';

const asNumber = (value: unknown) => Number(value || 0);

/** El servidor anterior a 20261211120000 no conoce departamento ni vereda. */
function isFunctionSignatureMissing(error: unknown) {
  const record = (error || {}) as { code?: unknown; message?: unknown };
  return String(record.code || '') === 'PGRST202' || /could not find the function/i.test(String(record.message || ''));
}

export type CandidatesResult = {
  rows: CollectionRouteCandidate[];
  totalCount: number;
  /** 'local' = sin señal, con lo descargado en el teléfono. */
  source: 'servidor' | 'local';
  /** El servidor todavía no filtra por departamento/vereda (migración pendiente). */
  locationFilterIgnored?: boolean;
};

async function fetchCandidatesFromServer(query: CandidateQuery, page: number, pageSize: number) {
  const base = {
    p_search: query.search,
    p_filter: query.filter,
    p_municipio_id: query.location.municipioId || null,
    p_page: page,
    p_page_size: pageSize,
  };
  let locationFilterIgnored = false;
  let { data, error } = await supabase.rpc('get_collection_route_candidates', {
    ...base,
    p_departamento_id: query.location.departamentoId || null,
    p_vereda_id: query.location.veredaId || null,
  });
  if (error && isFunctionSignatureMissing(error)) {
    // Servidor sin la migración: se pregunta como antes. 'al_dia' y 'pronto'
    // no los conoce, así que se piden todos.
    const legacyFilter = query.filter === 'al_dia' || query.filter === 'pronto' ? 'todas' : query.filter;
    ({ data, error } = await supabase.rpc('get_collection_route_candidates', { ...base, p_filter: legacyFilter }));
    locationFilterIgnored = Boolean(query.location.departamentoId || query.location.veredaId);
  }
  if (error) throw new Error(error.message || 'No fue posible buscar los negocios');
  const rows = ((data || []) as CollectionRouteCandidate[]).map((row) => ({
    ...row,
    negocio_numero: asNumber(row.negocio_numero),
    expected_balance: asNumber(row.expected_balance),
    overdue_balance: asNumber(row.overdue_balance),
    open_installments: asNumber(row.open_installments),
    total_count: asNumber(row.total_count),
  }));
  return { rows, totalCount: rows[0]?.total_count || 0, locationFilterIgnored };
}

/**
 * Negocios que el gestor puede meter en la ruta. Con señal pregunta al
 * servidor; sin señal usa lo descargado en el teléfono (si no hay nada, el
 * error de red sube a la pantalla).
 */
export async function fetchRouteCandidates(params: {
  query: CandidateQuery;
  page: number;
  pageSize: number;
  userId: string | null;
  /** NetInfo ya dice que no hay red: no se espera el tiempo límite del servidor. */
  offline?: boolean;
}): Promise<CandidatesResult> {
  const fromLocal = async () =>
    params.userId
      ? fetchRouteCandidatesFromLocal({
          userId: params.userId,
          today: bogotaDateValue(),
          query: params.query,
          page: params.page,
          pageSize: params.pageSize,
        })
      : null;
  if (params.offline) {
    const local = await fromLocal();
    if (local) return { ...local, source: 'local' };
    throw new Error('Sin conexión y sin datos descargados en el teléfono.');
  }
  try {
    const result = await fetchCandidatesFromServer(params.query, params.page, params.pageSize);
    return { ...result, source: 'servidor' };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const local = await fromLocal();
    if (!local) throw error;
    return { ...local, source: 'local' };
  }
}

/**
 * Todos los negocios que cumplen el filtro (para «Seleccionar todos»), hasta
 * el tope de paradas de una ruta. El servidor nuevo los da en una página; el
 * anterior, en páginas de 50.
 */
export async function fetchAllRouteCandidates(params: { query: CandidateQuery; userId: string | null; offline?: boolean }) {
  const pageSize = 50;
  const first = await fetchRouteCandidates({ ...params, page: 1, pageSize: MAX_ROUTE_STOPS });
  const rows = [...first.rows];
  let page = Math.ceil(rows.length / pageSize);
  // Servidor viejo: topa la página en 50 aunque se pidan 200.
  while (rows.length < Math.min(first.totalCount, MAX_ROUTE_STOPS) && rows.length % pageSize === 0 && rows.length > 0) {
    page += 1;
    const next = await fetchRouteCandidates({ ...params, page, pageSize });
    if (!next.rows.length) break;
    rows.push(...next.rows.filter((row) => !rows.some((item) => item.negocio_id === row.negocio_id)));
  }
  return { ...first, rows: rows.slice(0, MAX_ROUTE_STOPS) };
}

export async function createCollectionRoute(negocioIds: string[], routeDate: string) {
  const { data, error } = await supabase.rpc('create_collection_route', {
    p_negocio_ids: negocioIds,
    p_route_date: routeDate,
  });
  if (error) throw new Error(error.message || 'No fue posible crear la ruta');
  return data as string;
}

/**
 * Cambia las paradas de una ruta en borrador o en curso (agregar, quitar,
 * reordenar). Necesita señal: el orden y las paradas los decide el servidor.
 */
export async function setCollectionRouteStops(routeId: string, negocioIds: string[]) {
  const { error } = await supabase.rpc('set_collection_route_stops', {
    p_route_id: routeId,
    p_negocio_ids: negocioIds,
  });
  if (error) {
    if (isFunctionSignatureMissing(error)) {
      throw new Error('El servidor todavía no permite editar rutas. Cancele esta ruta y cree una nueva.');
    }
    throw new Error(error.message || 'No fue posible guardar las paradas');
  }
}

export async function fetchMyCollectionRoutes() {
  try {
    const { data, error } = await supabase.rpc('get_my_collection_routes', { p_limit: 20 });
    if (error) throw new Error(error.message || 'No fue posible cargar las rutas');
    return ((data || []) as CollectionRouteSummary[]).map((row) => ({
      ...row,
      stop_count: asNumber(row.stop_count),
      completed_count: asNumber(row.completed_count),
      expected_total: asNumber(row.expected_total),
      collected_total: asNumber(row.collected_total),
    }));
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const local = await fetchRoutesFromLocal();
    if (!local) throw error;
    return withCachedActiveRoute(local, await getCachedActiveRoute());
  }
}

/**
 * Sin señal, la última ruta abierta con señal (guardada en caché) se suma a
 * la lista aunque no se haya descargado: así el gestor la encuentra y ve sus
 * paradas.
 */
export function withCachedActiveRoute(
  routes: CollectionRouteSummary[],
  cached: CollectionRoute | null
): CollectionRouteSummary[] {
  if (!cached || routes.some((route) => route.id === cached.id)) return routes;
  return [
    {
      id: cached.id,
      route_date: cached.route_date,
      status: cached.status,
      stop_count: cached.stops.length,
      completed_count: cached.stops.filter((stop) => isVisitedStopStatus(stop.status)).length,
      expected_total: cached.total_expected,
      collected_total: cached.total_collected,
    },
    ...routes,
  ].sort((a, b) => b.route_date.localeCompare(a.route_date));
}

export async function fetchCollectionRoute(routeId: string) {
  try {
    const { data, error } = await supabase.rpc('get_collection_route', { p_route_id: routeId });
    if (error) throw new Error(error.message || 'No fue posible cargar la ruta');
    if (!data) throw new Error('No fue posible cargar la ruta');
    const raw = data as CollectionRoute & {
      stops?: CollectionRoute['stops'];
      total_expected?: number;
      total_collected?: number;
    };
    const route: CollectionRoute = {
      ...raw,
      total_expected: asNumber(raw.total_expected),
      total_collected: asNumber(raw.total_collected),
      stops: (raw.stops || []).map((stop) => ({
        ...stop,
        negocio_numero: asNumber(stop.negocio_numero),
        position: asNumber(stop.position),
        expected_balance: asNumber(stop.expected_balance),
        payment_amount: stop.payment_amount == null ? null : asNumber(stop.payment_amount),
      })),
    };
    await cacheActiveRoute(route);
    // Si el gestor ya descargó esta ruta, su copia se mantiene al día con lo
    // que ve con señal (sus propias acciones, paradas editadas). Una ruta no
    // descargada no baja sola.
    try {
      await saveRouteCopyLocally(route, { onlyIfSaved: true });
    } catch {
      // La copia local es un respaldo: si falla, la pantalla sigue con el servidor.
    }
    return route;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const local = await fetchRouteFromLocal(routeId);
    if (local) return local;
    throw error;
  }
}

/** Resultado de una acción de ruta: `queued` indica que se guardó sin red. */
export type RouteActionResult = { queued: boolean };

export async function startCollectionRoute(routeId: string): Promise<RouteActionResult> {
  try {
    const { error } = await supabase.rpc('start_collection_route', { p_route_id: routeId });
    if (error) throw new Error(error.message || 'No fue posible iniciar la ruta');
    return { queued: false };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const queued = await enqueueRouteCommand({ type: 'start_route', routeId });
    if (!queued) throw error;
    return { queued: true };
  }
}

export async function selectCollectionRouteStop(stopId: string, routeId?: string | null): Promise<RouteActionResult> {
  try {
    const { error } = await supabase.rpc('select_collection_route_stop', { p_stop_id: stopId });
    if (error) throw new Error(error.message || 'No fue posible seleccionar la parada');
    return { queued: false };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const queued = await enqueueRouteCommand({ type: 'select_route_stop', stopId, routeId: routeId || null });
    if (!queued) throw error;
    return { queued: true };
  }
}

export async function updateCollectionRouteStop(
  stopId: string,
  status: Extract<StopStatus, 'sin_pago' | 'reprogramado' | 'omitido'>,
  reason: string,
  notes?: string,
  routeId?: string | null,
): Promise<RouteActionResult> {
  try {
    const { error } = await supabase.rpc('update_collection_route_stop', {
      p_stop_id: stopId,
      p_status: status,
      p_reason: reason,
      p_notes: notes || null,
    });
    if (error) throw new Error(error.message || 'No fue posible actualizar la parada');
    return { queued: false };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const queued = await enqueueRouteCommand({
      type: 'update_route_stop',
      stopId,
      routeId: routeId || null,
      status,
      reason,
      notes: notes || null,
    });
    if (!queued) throw error;
    return { queued: true };
  }
}

export type FinishRouteOptions = {
  /**
   * Cerrar la jornada aunque queden paradas: las pendientes (y la actual)
   * quedan «No visitada». Necesita la migración 20261216120000.
   */
  closePending?: boolean;
  /** Motivo opcional para las no visitadas. */
  reason?: string | null;
};

/**
 * Argumentos del RPC. Los nuevos solo viajan al cerrar con pendientes: así el
 * cierre normal y la cancelación siguen funcionando con un servidor sin la
 * migración.
 */
export function finishRouteRpcArgs(routeId: string, cancel: boolean, options: FinishRouteOptions = {}) {
  const args: { p_route_id: string; p_cancel: boolean; p_close_pending?: boolean; p_reason?: string } = {
    p_route_id: routeId,
    p_cancel: cancel,
  };
  if (!cancel && options.closePending) {
    args.p_close_pending = true;
    const reason = options.reason?.trim();
    if (reason) args.p_reason = reason;
  }
  return args;
}

export async function finishCollectionRoute(
  routeId: string,
  cancel = false,
  options: FinishRouteOptions = {}
): Promise<RouteActionResult> {
  const closePending = !cancel && Boolean(options.closePending);
  const reason = options.reason?.trim() || null;
  try {
    const { error } = await supabase.rpc('finish_collection_route', finishRouteRpcArgs(routeId, cancel, options));
    if (error) {
      if (closePending && isFunctionSignatureMissing(error)) {
        throw new Error('El servidor todavía no permite cerrar la jornada con paradas pendientes. Atiéndelas o cancela la ruta.');
      }
      throw new Error(error.message || 'No fue posible finalizar la ruta');
    }
    return { queued: false };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const queued = await enqueueRouteCommand(
      closePending ? { type: 'finish_route', routeId, cancel, closePending, reason } : { type: 'finish_route', routeId, cancel }
    );
    if (!queued) throw error;
    return { queued: true };
  }
}

/** Estado de la ruta en el teléfono. `serverRoute` null = sin señal. */
export async function getRouteOfflineStatus(
  routeId: string,
  serverRoute: CollectionRoute | null
): Promise<RouteOfflineStatus> {
  const [local, downloadedAt] = await Promise.all([readRouteLocalSnapshot(routeId), lastManualDownloadAt()]);
  return evaluateRouteOfflineStatus({ serverStops: serverRoute?.stops ?? null, local, downloadedAt });
}

export type RouteDownloadResult =
  | { ok: true; status: RouteOfflineStatus }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'error'; message: string };

/**
 * «Descargar ruta para usar sin señal»: descarga manual completa (negocios,
 * cuotas, pagos y clientes, como «Preparar el teléfono»), guarda la ruta tal
 * como está en el servidor (también las paradas quitadas, que la descarga no
 * borra) y comprueba que cada parada tiene su negocio en el teléfono.
 */
export async function downloadRouteForOffline(routeId: string): Promise<RouteDownloadResult> {
  const download = await requestManualDownload();
  if (!download.ok) return download;
  let route: CollectionRoute;
  try {
    route = await fetchCollectionRoute(routeId);
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  try {
    await saveRouteCopyLocally(route, { onlyIfSaved: false });
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: `No fue posible guardar la ruta en el teléfono: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { ok: true, status: await getRouteOfflineStatus(routeId, route) };
}
