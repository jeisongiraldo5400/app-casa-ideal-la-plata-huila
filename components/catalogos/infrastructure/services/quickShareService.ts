import { supabase } from '@/lib/supabase';
import { quickShareTitle } from '@/lib/catalogos/quickShare';
import { buildMagazineUrl, expiresAtFromHours } from '@/lib/catalogos/shareLinks';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { createCatalogShareLink } from './catalogShareLinksService';
import { toggleCatalogProduct } from './catalogItemsService';
import { buildCatalogSnapshot } from './catalogSnapshotService';
import { createPrivateCatalog, currentUserId, getPrivateCatalog } from './catalogsService';
import { generateShareToken } from './shareTokenService';

export type QuickShareInput = {
  productId: string;
  productName: string;
  /** Para quién es: lo que el vendedor verá en sus enlaces y en el aviso de apertura. */
  label: string;
  hours: number;
};

export type QuickShareResult = {
  catalogId: string;
  url: string;
  expiresAt: string;
  publicTitle: string;
};

/** La edición contiene este producto y ningún otro. */
function holdsOnly(detail: PrivateCatalogDetail, productId: string): boolean {
  const items = detail.sections.flatMap((section) => section.items);
  return items.length === 1 && items[0]?.itemType === 'product' && items[0]?.referenceId === productId;
}

/**
 * Edición de envío rápido que el vendedor ya tiene para este producto.
 *
 * Solo se reutiliza si sigue conteniendo ese producto y nada más: si alguien
 * la editó y le añadió otros, mandarla haría llegar al cliente algo distinto
 * de lo que se eligió, así que se crea una nueva.
 */
async function findReusableEdition(productId: string, title: string): Promise<PrivateCatalogDetail | null> {
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
    if (detail && holdsOnly(detail, productId)) return detail;
  }
  return null;
}

/**
 * Manda UN producto a un cliente: prepara (o reutiliza) una edición con solo
 * ese producto, la congela y crea el enlace. Mismos pasos y mismas reglas que
 * «Compartir» en una edición normal; el cliente ve la misma revista.
 */
export async function shareSingleProduct(input: QuickShareInput): Promise<QuickShareResult> {
  const title = quickShareTitle(input.productName);

  let detail = await findReusableEdition(input.productId, title);
  if (!detail) {
    const { id } = await createPrivateCatalog({ internalTitle: title, publicTitle: input.productName.trim() });
    await toggleCatalogProduct(id, input.productId, true, []);
    detail = await getPrivateCatalog(id);
  }
  if (!detail) throw new Error('No fue posible preparar el envío. Inténtalo de nuevo.');

  const snapshot = await buildCatalogSnapshot(detail);
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
