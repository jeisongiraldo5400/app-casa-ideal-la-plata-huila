/**
 * Ayudas de «Preparar el teléfono» que consultan el servidor (en modo «Elegir»
 * el teléfono no tiene precisamente lo que se quiere elegir):
 *
 * - `fetchCustomerCandidates`: ids de los clientes de un vendedor, para el
 *   atajo «Mis clientes». Decisión v2: el atajo MARCA esos ids uno a uno (con
 *   el mismo RPC y el mismo tope de 1000), en vez de un flag de preferencias;
 *   así funciona sin otra migración y se ve igual en la lista de elegidos.
 * - `estimateSelection`: total estimado de clientes y negocios que bajarán.
 */
import { supabase } from '@/lib/supabase';
import { SELECTION_LIMITS } from './syncPrefsService';

export type BulkCandidates = {
  ids: string[];
  /** Total en el servidor; puede superar a `ids.length` si pasa del tope. */
  total: number;
};

export async function fetchCustomerCandidates(criteria: { sellerId: string | null }): Promise<BulkCandidates> {
  if (!criteria.sellerId) return { ids: [], total: 0 };
  const { data, error, count } = await supabase
    .from('customers')
    .select('id', { count: 'exact' })
    .is('deleted_at', null)
    .eq('seller_id', criteria.sellerId)
    .order('name')
    .limit(SELECTION_LIMITS.clientes);
  if (error) throw new Error(error.message || 'No se pudieron contar tus clientes');
  const ids = (data || []).map((row) => row.id);
  return { ids, total: count ?? ids.length };
}

export type SelectionEstimate = {
  clientes: number;
  /** `null` si no se pudo estimar. */
  negocios: number | null;
  /** true si es una suma aproximada hecha en el teléfono (puede contar dos veces). */
  approximate: boolean;
};

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * Total estimado. Si el servidor tiene `estimate_mobile_sync_scope` (paquete A)
 * se usa; si no, se suman en el teléfono los marcados uno a uno y los clientes
 * de los municipios elegidos, y los negocios de esos municipios.
 */
export async function estimateSelection(input: {
  municipioIds: string[];
  markedCount: number;
}): Promise<SelectionEstimate> {
  try {
    const { data, error } = await (supabase.rpc as unknown as UntypedRpc)('estimate_mobile_sync_scope');
    if (!error && data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const clientes = Number(record.clientes);
      const negocios = Number(record.negocios);
      if (Number.isFinite(clientes)) {
        return { clientes, negocios: Number.isFinite(negocios) ? negocios : null, approximate: false };
      }
    }
  } catch {
    // Sin la función en el servidor: estimación local.
  }

  let fromMunicipios = 0;
  let negocios: number | null = null;
  if (input.municipioIds.length) {
    const [customers, deals] = await Promise.all([
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('municipio_id', input.municipioIds),
      supabase
        .from('negocios')
        .select('id', { count: 'exact', head: true })
        .in('municipio_id', input.municipioIds),
    ]);
    fromMunicipios = customers.count ?? 0;
    negocios = deals.error ? null : (deals.count ?? 0);
  }
  return { clientes: input.markedCount + fromMunicipios, negocios, approximate: true };
}
