import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { canUseLocalDb, fetchNegociosProductsFromLocal } from '@/lib/offline/repositories/offlineRepository';
import {
  groupNegocioProducts,
  type NegocioProductLine,
  type NegocioProductSourceRow,
} from '@/lib/negocios/negocioProducts';

type ItemRow = {
  negocio_id: string;
  quantity: number | string | null;
  description: string | null;
  product: { name: string | null; sku: string | null } | null;
};

/**
 * Productos de varios negocios en una sola consulta (tarjetas de Negocios,
 * Mis negocios y la ficha del cliente). Con señal sale del servidor; sin
 * señal, de lo descargado en el teléfono. Los negocios que el servidor aún no
 * conoce (creados sin señal y sin enviar) se completan desde el teléfono.
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
    const found = new Set(rows.map((row) => row.negocioId));
    const missing = negocioIds.filter((id) => !found.has(id));
    if (missing.length > 0 && canUseLocalDb()) {
      // Si la base local falla, se muestra lo que trajo el servidor.
      const local = await fetchNegociosProductsFromLocal(missing).catch(() => []);
      rows.push(...local);
    }
    return groupNegocioProducts(rows);
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    return groupNegocioProducts(await fetchNegociosProductsFromLocal(negocioIds));
  }
}
