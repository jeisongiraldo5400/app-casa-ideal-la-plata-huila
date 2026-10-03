import { supabase } from '@/lib/supabase';
import { receiptProductsFromItems, type NegocioReceiptProduct } from '@/lib/negocioReceiptHtml';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchNegocioTotalCreditFromLocal,
  fetchNegociosProductsFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
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

/**
 * Productos de un negocio para su recibo de pago (cantidad, nombre, precio
 * unitario y subtotal, como el contrato). Con señal salen del servidor; sin señal, o si el
 * servidor no responde, de lo descargado en el teléfono. Nunca lanza: si no
 * hay de dónde leerlos, el recibo sale sin la sección de productos.
 */
export async function fetchNegocioReceiptProducts(negocioId: string): Promise<NegocioReceiptProduct[]> {
  const fromLocal = async () => {
    if (!canUseLocalDb()) return [];
    const rows = await fetchNegociosProductsFromLocal([negocioId]).catch(() => []);
    return receiptProductsFromItems(
      rows.map((row) => ({
        quantity: row.quantity,
        description: row.description,
        product: { name: row.productName },
        unit_price: row.unitPrice ?? null,
        subtotal: row.subtotal ?? null,
      }))
    );
  };
  if (!useSyncStore.getState().online) return fromLocal();
  try {
    const { data, error } = await supabase
      .from('negocio_items')
      .select('quantity, description, unit_price, subtotal, product:products(name)')
      .eq('negocio_id', negocioId)
      .is('deleted_at', null)
      .order('created_at');
    if (error) throw error;
    const products = receiptProductsFromItems((data ?? []) as unknown as ItemRow[]);
    // Un negocio creado sin señal todavía no está en el servidor.
    return products.length > 0 ? products : await fromLocal();
  } catch (error) {
    if (!isNetworkError(error)) console.warn('[recibo] no se pudieron leer los productos del negocio', error);
    return fromLocal();
  }
}

/**
 * Valor total del negocio (productos + interés) para el recibo de un cobro:
 * con él el recibo imprime «Interés» y «Total» bajo los productos. Con señal
 * sale del servidor; sin señal, del teléfono. Nunca lanza: sin dato devuelve
 * null y el recibo sale como antes.
 */
export async function fetchNegocioReceiptTotalCredit(negocioId: string): Promise<number | null> {
  const fromLocal = () => fetchNegocioTotalCreditFromLocal(negocioId).catch(() => null);
  if (!useSyncStore.getState().online) return fromLocal();
  try {
    const { data, error } = await supabase
      .from('negocios')
      .select('total_credit')
      .eq('id', negocioId)
      .maybeSingle();
    if (error) throw error;
    const total = Number((data as { total_credit?: number | string | null } | null)?.total_credit);
    return data && Number.isFinite(total) ? total : await fromLocal();
  } catch (error) {
    if (!isNetworkError(error)) console.warn('[recibo] no se pudo leer el total del negocio', error);
    return fromLocal();
  }
}
