import { supabase } from '@/lib/supabase';
import { findLocalRouteOutcomes } from '@/lib/offline/repositories/routesRepository';
import {
  isUltimaGestionStatus,
  latestGestionByNegocio,
  type UltimaGestion,
} from './ultimaGestion';

/** Tope del RPC por llamada. */
const MAX_IDS = 200;

async function fromServer(negocioIds: string[]): Promise<UltimaGestion[]> {
  const { data, error } = await supabase.rpc('get_negocios_ultima_gestion', { p_negocio_ids: negocioIds });
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[])
    .filter((row) => isUltimaGestionStatus(row.stop_status))
    .map((row) => ({
      negocio_id: String(row.negocio_id),
      stop_status: row.stop_status as UltimaGestion['stop_status'],
      outcome_reason: (row.outcome_reason as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      occurred_at: (row.occurred_at as string | null) ?? null,
      route_date: (row.route_date as string | null) ?? null,
      gestor_name: (row.gestor_name as string | null) ?? null,
    }));
}

/**
 * Última novedad de ruta de cada negocio. Con señal, el servidor (ve las
 * rutas de todos los gestores); si no hay señal, el servidor no tiene aún la
 * función (20261220120000 sin aplicar) o falla, lo guardado en el teléfono.
 * Las novedades aún sin enviar del teléfono se suman: pueden ser más nuevas.
 * Nunca lanza: es un dato de apoyo.
 */
export async function fetchUltimaGestion(
  negocioIds: string[],
  online: boolean
): Promise<Map<string, UltimaGestion>> {
  const ids = Array.from(new Set(negocioIds.filter(Boolean))).slice(0, MAX_IDS);
  if (!ids.length) return new Map();
  const local = await findLocalRouteOutcomes(ids).catch(() => [] as UltimaGestion[]);
  if (!online) return latestGestionByNegocio(local);
  try {
    return latestGestionByNegocio([...(await fromServer(ids)), ...local]);
  } catch {
    return latestGestionByNegocio(local);
  }
}
