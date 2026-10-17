import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  parseDraftSourceCheck,
  parsePreparedDraftOriginChange,
  type DraftOriginTarget,
  type DraftSourceCheck,
  type PreparedDraftOriginChange,
} from '../../domain/draftOriginChange';

/**
 * RPC del cambio de origen de un borrador (migración 20261231570000) y el
 * cambio preparado sin señal (AsyncStorage, por negocio).
 */

type UntypedRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

export interface DraftOriginRpcClient {
  rpc: UntypedRpcClient['rpc'];
}

const defaultClient = () => supabase as unknown as DraftOriginRpcClient;

function rpcError(error: { message?: string; code?: string }, fallback: string): Error {
  // Se conserva el código para que errorMessage() traduzca permisos y red.
  return Object.assign(new Error(error.message || fallback), { code: error.code });
}

/** Revisa en el servidor, sin cambiar nada, si la orden trae lo del borrador. */
export async function checkDraftSource(
  negocioId: string,
  target: Pick<DraftOriginTarget, 'remission_id' | 'source_delivery_order_id'>,
  client: DraftOriginRpcClient = defaultClient()
): Promise<DraftSourceCheck> {
  const { data, error } = await client.rpc('check_negocio_draft_source', {
    p_negocio_id: negocioId,
    p_remission_id: target.remission_id,
    p_source_delivery_order_id: target.source_delivery_order_id,
  });
  if (error) throw rpcError(error, 'No se pudo revisar la orden');
  return parseDraftSourceCheck(data);
}

/** Cambia el origen del borrador (atómico e idempotente en el servidor). */
export async function changeDraftSource(
  negocioId: string,
  target: Pick<DraftOriginTarget, 'remission_id' | 'source_delivery_order_id'>,
  idempotencyKey: string,
  client: DraftOriginRpcClient = defaultClient()
): Promise<void> {
  const { error } = await client.rpc('change_negocio_draft_source', {
    p_negocio_id: negocioId,
    p_remission_id: target.remission_id,
    p_source_delivery_order_id: target.source_delivery_order_id,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw rpcError(error, 'No se pudo cambiar el origen del negocio');
}

const preparedKey = (negocioId: string) => `@casa_ideal/negocio/origen_preparado/${negocioId}`;

export async function readPreparedDraftOriginChange(negocioId: string): Promise<PreparedDraftOriginChange | null> {
  try {
    const value = parsePreparedDraftOriginChange(await AsyncStorage.getItem(preparedKey(negocioId)));
    return value && value.negocioId === negocioId ? value : null;
  } catch {
    return null;
  }
}

export async function savePreparedDraftOriginChange(change: PreparedDraftOriginChange): Promise<void> {
  await AsyncStorage.setItem(preparedKey(change.negocioId), JSON.stringify(change));
}

export async function clearPreparedDraftOriginChange(negocioId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(preparedKey(negocioId));
  } catch {
    // Si no se pudo borrar, la próxima confirmación responde por idempotencia.
  }
}
