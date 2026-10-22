import { supabase } from '@/lib/supabase';
import { getDatabase } from '@/lib/offline/database';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { canUseLocalCatalog } from '@/lib/offline/repositories/catalogRepository';
import {
  parseSalePriceRows,
  readLocalSalePrice,
  readLocalSalePrices,
  type SalePriceMap,
} from '@/lib/offline/sync/salePrices';

type RpcFn = (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Precio de venta de un producto para rellenar el valor unitario del negocio
 * (20261231730000). Con señal se pregunta al servidor (`get_product_sale_prices`,
 * solo el precio); sin señal, o si el servidor falla, se usa lo bajado en la
 * última «Descargar». Nunca lanza: sin precio devuelve null y el valor
 * unitario queda vacío como antes.
 */
export async function fetchSalePrice(productId: string): Promise<number | null> {
  if (!productId) return null;
  const fromLocal = async () => {
    if (!canUseLocalCatalog()) return null;
    return readLocalSalePrice(getDatabase(), productId).catch(() => null);
  };
  if (!useSyncStore.getState().online) return fromLocal();
  try {
    const { data, error } = await (supabase.rpc as unknown as RpcFn)('get_product_sale_prices', {
      p_product_ids: [productId],
    });
    if (error) return fromLocal();
    return parseSalePriceRows(data)[productId] ?? null;
  } catch {
    return fromLocal();
  }
}

/**
 * Precios de venta de varios productos (tarjetas del inventario). Mismo
 * criterio: servidor con señal, teléfono sin ella o si falla. Nunca lanza.
 */
export async function fetchSalePrices(productIds: readonly string[]): Promise<SalePriceMap> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const fromLocal = async (): Promise<SalePriceMap> => {
    if (!canUseLocalCatalog()) return {};
    const all = await readLocalSalePrices(getDatabase()).catch(() => ({}) as SalePriceMap);
    const out: SalePriceMap = {};
    for (const id of ids) if (all[id] !== undefined) out[id] = all[id];
    return out;
  };
  if (!useSyncStore.getState().online) return fromLocal();
  try {
    const { data, error } = await (supabase.rpc as unknown as RpcFn)('get_product_sale_prices', {
      p_product_ids: ids,
    });
    if (error) return fromLocal();
    return parseSalePriceRows(data);
  } catch {
    return fromLocal();
  }
}
