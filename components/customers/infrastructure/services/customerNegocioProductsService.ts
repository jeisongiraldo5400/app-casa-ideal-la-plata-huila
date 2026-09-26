import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { canUseLocalDb, fetchNegociosProductsFromLocal } from '@/lib/offline/repositories/offlineRepository';
import {
  groupNegocioProducts,
  type NegocioProductLine,
  type NegocioProductSourceRow,
} from '@/lib/customers/negocioProducts';

type ItemRow = {
  negocio_id: string;
  quantity: number | string | null;
  description: string | null;
  product: { name: string | null; sku: string | null } | null;
};

/**
 * Productos de los negocios de un cliente, en una sola consulta. Con señal
 * sale del servidor; sin señal, de lo descargado en el teléfono.
 */
export async function fetchNegociosProducts(negocioIds: readonly string[]): Promise<Map<string, NegocioProductLine[]>> {
  if (negocioIds.length === 0) return new Map();
  try {
    const { data, error } = await supabase
      .from('negocio_items')
      .select('negocio_id, quantity, description, product:products(name, sku)')
      .in('negocio_id', [...negocioIds])
      .is('deleted_at', null)
      .order('created_at');
    if (error) throw error;
    const rows: NegocioProductSourceRow[] = ((data ?? []) as unknown as ItemRow[]).map((row) => ({
      negocioId: row.negocio_id,
      productName: row.product?.name ?? null,
      productSku: row.product?.sku ?? null,
      description: row.description,
      quantity: Number(row.quantity) || 0,
    }));
    return groupNegocioProducts(rows);
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    return groupNegocioProducts(await fetchNegociosProductsFromLocal(negocioIds));
  }
}
