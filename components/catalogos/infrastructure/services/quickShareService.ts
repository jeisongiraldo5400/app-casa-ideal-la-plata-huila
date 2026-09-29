import { supabase } from '@/lib/supabase';
import { QUICK_SHARE_MAX_PRODUCTS, quickShareBundleTitles, quickShareTitle } from '@/lib/catalogos/quickShare';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import { buildMagazineUrl, expiresAtFromHours } from '@/lib/catalogos/shareLinks';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { createCatalogShareLink } from './catalogShareLinksService';
import { addCatalogProducts, toggleCatalogProduct } from './catalogItemsService';
import { buildCatalogSnapshot, type AnalyzeSnapshotOptions, type SnapshotProgress } from './catalogSnapshotService';
import { archiveOwnCatalog, createPrivateCatalog, currentUserId, getPrivateCatalog } from './catalogsService';
import { generateShareToken } from './shareTokenService';

export type QuickShareInput = {
  productId: string;
  productName: string;
  /** Para quién es: lo que el vendedor verá en sus enlaces y en el aviso de apertura. */
  label: string;
  hours: number;
};

export type QuickShareProductsInput = {
  /** Fichas elegidas, en el orden en que se eligieron. */
  products: readonly PublicCatalogListingItem[];
  label: string;
  hours: number;
  onProgress?: (progress: SnapshotProgress) => void;
};

export type QuickShareResult = {
  catalogId: string;
  url: string;
  expiresAt: string;
  publicTitle: string;
};

/** La edición contiene exactamente estos productos (en cualquier orden) y nada más. */
function holdsExactly(detail: PrivateCatalogDetail, productIds: readonly string[]): boolean {
  const items = detail.sections.flatMap((section) => section.items);
  if (items.length !== productIds.length) return false;
  const wanted = new Set(productIds);
  return items.every((item) => item.itemType === 'product' && wanted.has(item.referenceId));
}

/**
 * Edición de envío rápido que el vendedor ya tiene con estos productos.
 *
 * Solo se reutiliza si sigue conteniendo esos productos y nada más: si alguien
 * la editó y le añadió o quitó otros, mandarla haría llegar al cliente algo
 * distinto de lo que se eligió, así que se crea una nueva.
 */
async function findReusableEdition(productIds: readonly string[], title: string): Promise<PrivateCatalogDetail | null> {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from('catalogs')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('internal_title', title)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) throw new Error(`No fue posible buscar el envío anterior: ${error.message}`);

  for (const row of (data ?? []) as { id: string }[]) {
    const detail = await getPrivateCatalog(row.id);
    if (detail && holdsExactly(detail, productIds)) return detail;
  }
  return null;
}

/** Congela la edición y crea el enlace: mismos pasos que «Compartir» en una edición normal. */
async function createQuickShareLink(
  detail: PrivateCatalogDetail,
  input: { label: string; hours: number },
  options: AnalyzeSnapshotOptions = {}
): Promise<QuickShareResult> {
  const snapshot = await buildCatalogSnapshot(detail, options);
  const token = await generateShareToken();
  const created = await createCatalogShareLink({
    catalogId: detail.id,
    snapshot,
    token: token.token,
    tokenHash: token.tokenHash,
    tokenHint: token.tokenHint,
    label: input.label,
    expiresAt: expiresAtFromHours(input.hours),
  });

  return {
    catalogId: detail.id,
    url: buildMagazineUrl(token.token),
    expiresAt: created.expiresAt,
    publicTitle: detail.publicTitle,
  };
}

/**
 * Manda UN producto a un cliente: prepara (o reutiliza) una edición con solo
 * ese producto, la congela y crea el enlace. El cliente ve la misma revista.
 */
export async function shareSingleProduct(input: QuickShareInput): Promise<QuickShareResult> {
  const title = quickShareTitle(input.productName);

  let detail = await findReusableEdition([input.productId], title);
  if (!detail) {
    const { id } = await createPrivateCatalog({ internalTitle: title, publicTitle: input.productName.trim() });
    await toggleCatalogProduct(id, input.productId, true, []);
    detail = await getPrivateCatalog(id);
  }
  if (!detail) throw new Error('No fue posible preparar el envío. Inténtalo de nuevo.');

  return createQuickShareLink(detail, input);
}

/**
 * Manda uno o varios productos en UN solo enlace.
 *
 * - Uno: exactamente lo de siempre (`shareSingleProduct`).
 * - Varios: UNA edición «Envío rápido · N productos: …» con todos ellos
 *   (reutilizada si ya existe con el mismo conjunto), un solo enlace.
 */
export async function shareProducts(input: QuickShareProductsInput): Promise<QuickShareResult> {
  const seen = new Set<string>();
  const products = input.products.filter((item) => !seen.has(item.productId) && seen.add(item.productId));
  if (products.length === 0) throw new Error('Elige al menos un producto.');
  if (products.length > QUICK_SHARE_MAX_PRODUCTS) {
    throw new Error(`Puedes enviar hasta ${QUICK_SHARE_MAX_PRODUCTS} productos a la vez.`);
  }

  const [first] = products;
  if (products.length === 1 && first) {
    return shareSingleProduct({ productId: first.productId, productName: first.displayName, label: input.label, hours: input.hours });
  }

  const productIds = products.map((item) => item.productId);
  const titles = quickShareBundleTitles(products.map((item) => item.displayName));

  let detail = await findReusableEdition(productIds, titles.internalTitle);
  if (!detail) {
    const { id } = await createPrivateCatalog(titles);
    try {
      await addCatalogProducts(id, productIds, []);
    } catch (caught) {
      // Que no quede en la lista una edición vacía a medio hacer.
      await archiveOwnCatalog(id).catch(() => undefined);
      throw caught;
    }
    detail = await getPrivateCatalog(id);
  }
  if (!detail) throw new Error('No fue posible preparar el envío. Inténtalo de nuevo.');

  // Las fichas ya están cargadas en la pantalla: no se vuelven a pedir al listado.
  const known = new Map(products.map((item) => [item.productId, item]));
  return createQuickShareLink(detail, input, { known: { products: known }, onProgress: input.onProgress });
}
