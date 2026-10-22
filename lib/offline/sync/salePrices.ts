import type { Database } from '@nozbe/watermelondb';
import { getMeta, setMeta } from './outbox';

/**
 * Precios de venta de los productos para el modo sin señal (20261231730000).
 *
 * Al hacer el negocio, si el producto tiene precio de venta (lo registra solo
 * el perfil Costos) el valor unitario se rellena con él y el vendedor puede
 * cambiarlo. Sin señal se usa la lista bajada en la última «Descargar»:
 * se pide ENTERA (`get_product_sale_prices(NULL)`, solo producto y precio,
 * nunca costos) justo después del catálogo y se guarda en `sync_meta` como
 * JSON. Reemplazo completo en cada descarga: un precio quitado desaparece.
 *
 * No va en `pull_mobile_sync` ni en `catalog_products` a propósito: así no se
 * toca el paquete que leen las apps ya instaladas ni el esquema local.
 */
export const SALE_PRICES_META_KEY = 'product_sale_prices';

export type SalePriceMap = Record<string, number>;

type RpcCaller = (
  fn: 'get_product_sale_prices',
  args: { p_product_ids: string[] | null }
) => PromiseLike<{ data: unknown; error: unknown }>;

/** Precio entero en pesos (el negocio solo acepta valores enteros), o null. */
export function normalizeSalePrice(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 && Number.isSafeInteger(rounded) ? rounded : null;
}

/** Filas `{product_id, price}` del servidor → mapa producto → precio. */
export function parseSalePriceRows(data: unknown): SalePriceMap {
  const out: SalePriceMap = {};
  if (!Array.isArray(data)) return out;
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { product_id?: unknown; price?: unknown };
    if (typeof row.product_id !== 'string' || !row.product_id) continue;
    const price = normalizeSalePrice(row.price);
    if (price !== null) out[row.product_id] = price;
  }
  return out;
}

/** Lo guardado en el teléfono; vacío si no hay nada o está dañado. */
export function parseStoredSalePrices(raw: string | null | undefined): SalePriceMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SalePriceMap = {};
    for (const [productId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const price = normalizeSalePrice(value);
      if (price !== null) out[productId] = price;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Baja la lista completa y la guarda. Nunca lanza: si falla (sin red, o un
 * servidor sin la función) se conserva la lista anterior y la descarga sigue.
 */
export async function downloadSalePrices(database: Database, rpc: RpcCaller): Promise<boolean> {
  try {
    const { data, error } = await rpc('get_product_sale_prices', { p_product_ids: null });
    if (error || !Array.isArray(data)) return false;
    await setMeta(database, SALE_PRICES_META_KEY, JSON.stringify(parseSalePriceRows(data)));
    return true;
  } catch {
    return false;
  }
}

/** Productos en «ninguno»: el teléfono deja de guardar precios. */
export async function forgetSalePrices(database: Database) {
  await setMeta(database, SALE_PRICES_META_KEY, '');
}

/** Precio de venta guardado en el teléfono para un producto, o null. */
export async function readLocalSalePrice(database: Database, productId: string): Promise<number | null> {
  const prices = parseStoredSalePrices(await getMeta(database, SALE_PRICES_META_KEY));
  return prices[productId] ?? null;
}

/** Todos los precios guardados en el teléfono (vacío si no hay). */
export async function readLocalSalePrices(database: Database): Promise<SalePriceMap> {
  return parseStoredSalePrices(await getMeta(database, SALE_PRICES_META_KEY));
}
