import { supabase } from '@/lib/supabase';
import { getCachedActiveRoute } from './routeCache';
import {
  findLocalCurrentStopsForNegocio,
  readLocalRouteStop,
} from '@/lib/offline/repositories/routesRepository';
import { bogotaDateValue } from '@/lib/localDate';
import {
  pickSuggestedStop,
  stopStatesFromRoute,
  stopStillCurrent,
  type KnownStopState,
} from './routeStopPago';

type ServerStopRow = {
  id: string;
  route_id: string;
  negocio_id: string;
  position: number;
  status: string;
  route: { status: string; route_date: string } | null;
};

async function readServerStop(stopId: string): Promise<KnownStopState | null> {
  // RLS: el gestor dueño de la ruta (o el admin) lee sus paradas.
  const { data, error } = await supabase
    .from('collection_route_stops')
    .select('id, route_id, negocio_id, position, status, route:collection_routes(status, route_date)')
    .eq('id', stopId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as ServerStopRow;
  return {
    stopId: row.id,
    routeId: row.route_id,
    negocioId: row.negocio_id,
    position: Number(row.position),
    stopStatus: row.status,
    routeStatus: row.route?.status ?? null,
    routeDate: row.route?.route_date ?? null,
  };
}

async function readCachedStop(stopId: string): Promise<KnownStopState | null> {
  const cached = await getCachedActiveRoute().catch(() => null);
  return stopStatesFromRoute(cached).find((state) => state.stopId === stopId) ?? null;
}

/**
 * Lo que se sabe de una parada: con señal, el servidor; si no responde (o sin
 * señal), la copia del teléfono y, por último, la ruta en caché. null = nada.
 */
export async function readRouteStopState(stopId: string, online: boolean): Promise<KnownStopState | null> {
  if (online) {
    const server = await readServerStop(stopId).catch(() => null);
    if (server) return server;
  }
  const local = await readLocalRouteStop(stopId).catch(() => null);
  if (local) return local;
  return readCachedStop(stopId);
}

/** ¿La parada sigue siendo la actual? null si no se sabe. */
export async function isRouteStopStillCurrent(stopId: string, online: boolean): Promise<boolean | null> {
  return stopStillCurrent(await readRouteStopState(stopId, online));
}

/**
 * Parada actual de una ruta en curso para este negocio (para ofrecer contar
 * el cobro en la ruta). Mira el teléfono y la ruta en caché; con señal, la
 * confirma con el servidor antes de ofrecerla.
 */
export async function findSuggestedStopForNegocio(
  negocioId: string,
  online: boolean
): Promise<KnownStopState | null> {
  const [local, cached] = await Promise.all([
    findLocalCurrentStopsForNegocio(negocioId).catch(() => [] as KnownStopState[]),
    getCachedActiveRoute().catch(() => null),
  ]);
  const suggestion = pickSuggestedStop([...local, ...stopStatesFromRoute(cached)], negocioId, bogotaDateValue());
  if (!suggestion || !online) return suggestion;
  const server = await readServerStop(suggestion.stopId).catch(() => null);
  if (!server) return suggestion;
  return stopStillCurrent(server) ? { ...suggestion, ...server } : null;
}
