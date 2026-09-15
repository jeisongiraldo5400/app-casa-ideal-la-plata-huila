import { supabase } from '@/lib/supabase';
import type { NegocioContactDetailsInput } from '@/lib/negocios/negocioEditRules';

export type NegocioContactDetailsResult = {
  negocio_id: string;
  changed: boolean;
  direccion: string;
  municipio_id: string;
  vereda_id: string | null;
  notes: string | null;
};

/**
 * Edita dirección, municipio, vereda y notas de un negocio activo, entregado o
 * cerrado (`update_negocio_contact_details`, migración 20261029130000). Solo con
 * conexión: no pasa por la cola offline. Lanza el error del RPC tal cual.
 */
export async function updateNegocioContactDetails(
  negocioId: string,
  input: NegocioContactDetailsInput
): Promise<NegocioContactDetailsResult> {
  // `p_vereda_id` y `p_notes` admiten NULL; los tipos generados no lo expresan.
  const nullableArg = null as unknown as string;
  const { data, error } = await supabase.rpc('update_negocio_contact_details', {
    p_negocio_id: negocioId,
    p_direccion: input.direccion.trim(),
    p_municipio_id: input.municipioId,
    p_vereda_id: input.veredaId || nullableArg,
    p_notes: input.notes.trim() || nullableArg,
  });
  if (error) throw error;
  return data as unknown as NegocioContactDetailsResult;
}
