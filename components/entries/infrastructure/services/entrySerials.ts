import { supabase } from '@/lib/supabase';
import { SERIALS_NOT_ENABLED_MESSAGE, type SerialAvailability } from '@/components/inventory-flow/serials';

/**
 * Pregunta al servidor si el serial ya está en stock (en cualquier bodega) para esta referencia.
 * Lanza si la consulta falla por red/servidor; register_inventory_entries_batch vuelve a validar.
 */
export async function checkEntrySerialAvailability(productId: string, serial: string): Promise<SerialAvailability> {
  const { data, error } = await supabase.rpc('check_entry_serial', {
    p_product_id: productId,
    p_serial: serial,
  });

  if (error) {
    // Sin la migración el RPC de registro ignoraría los seriales: mejor no capturarlos.
    if (error.code === 'PGRST202') {
      return { available: false, message: SERIALS_NOT_ENABLED_MESSAGE };
    }
    throw error;
  }

  const result = data as { available?: boolean; message?: string } | null;
  if (result?.available === false) {
    return { available: false, message: result.message || 'Este serial ya está en una bodega.' };
  }
  return { available: true };
}
