/**
 * Remisión en la que viaja hoy la orden de entrega de un negocio, para la
 * línea «Sale en la remisión OE-…» del detalle.
 *
 * La da `get_negocio_active_remission` (migración 20261129120000) con la
 * relación vigente `remission_delivery_orders`, no la remisión elegida al crear
 * el negocio (`target_remission_id`), que deja de ser cierta si la orden se
 * saca de la remisión. El servidor aplica la misma lectura que al negocio.
 *
 * Es un dato opcional: sin señal no se pide, y si el servidor aún no tiene la
 * función o falla, la línea simplemente no aparece.
 */

export interface NegocioRemisionVigente {
  id: string;
  /** Código visible de la remisión (OE-…); null en datos viejos sin número. */
  numero: string | null;
}

type RpcResult = { data: unknown; error: unknown };

/** Lo mínimo del cliente de Supabase que hace falta (facilita las pruebas). */
export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
}

/** Primera fila del RPC como remisión vigente, o null si no hay. */
export function parseRemisionVigente(data: unknown): NegocioRemisionVigente | null {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== 'object') return null;
  const { remission_id, remission_number } = fila as {
    remission_id?: unknown;
    remission_number?: unknown;
  };
  if (typeof remission_id !== 'string' || !remission_id) return null;
  const numero = typeof remission_number === 'string' && remission_number.trim() ? remission_number.trim() : null;
  return { id: remission_id, numero };
}

export function labelRemisionVigente(remision: NegocioRemisionVigente): string {
  return `Sale en la remisión ${remision.numero || 'sin número'}`;
}

/** Nunca lanza: cualquier fallo (sin red, función ausente, permiso) es null. */
export async function fetchNegocioRemisionVigente(
  client: RpcClient,
  negocioId: string
): Promise<NegocioRemisionVigente | null> {
  try {
    const { data, error } = await client.rpc('get_negocio_active_remission', { p_negocio_id: negocioId });
    if (error) return null;
    return parseRemisionVigente(data);
  } catch {
    return null;
  }
}
