import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '@/lib/offline/database';
import { CatalogProduct, Negocio, SyncOutboxItem } from '@/lib/offline/models';
import {
  canUseLocalDb,
  fetchNegocioDetailFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import { DEFAULT_REJECTED_NEGOCIO_REASON } from '@/lib/offline/sync/negocioCreateCommand';
import { buildNegocioSyncStateMap } from '@/lib/offline/sync/negocioPendingSync';
import { parseOutboxPayload } from '@/lib/offline/sync/outbox';
import {
  buildPendingNegocioPreview,
  type PendingNegocioPreview,
  type PendingNegocioSync,
  type PendingProductName,
} from '../../domain/pendingNegocioPreview';

type LocalDetail = NonNullable<Awaited<ReturnType<typeof fetchNegocioDetailFromLocal>>>;

export type LocalNegocioDetail = LocalDetail & {
  /** Estado de envío si el negocio se creó en el teléfono y el servidor aún no lo confirma. */
  pendingSync: PendingNegocioSync | null;
};

/**
 * Estado de envío y vista previa (productos y plan) de un negocio creado sin
 * señal. `null` si el negocio ya está confirmado, no existe en el teléfono o
 * el usuario lo descartó. Solo lee: la cola la gestiona la sincronización.
 */
export async function loadPendingNegocio(
  negocioId: string
): Promise<{ sync: PendingNegocioSync; preview: PendingNegocioPreview } | null> {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  let row: Negocio;
  try {
    row = await database.get<Negocio>('negocios').find(negocioId);
  } catch {
    return null;
  }
  const commands = (
    await database.get<SyncOutboxItem>('sync_outbox').query(Q.where('type', 'create_negocio')).fetch()
  )
    .map((item) => ({ item, payload: parseOutboxPayload<Record<string, unknown>>(item) }))
    .filter(({ payload }) => payload.negocioId === negocioId)
    .sort((a, b) => b.item.queuedAt - a.item.queuedAt);

  const state = buildNegocioSyncStateMap(
    commands.map(({ item, payload }) => ({ type: item.type, status: item.status, payload })),
    [{ id: row.id, rowSyncStatus: row.rowSyncStatus }]
  )[negocioId];
  if (!state) return null;

  // El comando vivo más reciente manda (tras «Reintentar» vuelve a pendiente).
  const command = commands.find(({ item }) => item.status !== 'discarded') ?? commands[0];
  const payload = command?.payload ?? {};
  const negocioArgs =
    payload.negocio && typeof payload.negocio === 'object' ? (payload.negocio as Record<string, unknown>) : {};
  const itemArgs = Array.isArray(payload.items)
    ? (payload.items.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
    : [];

  const productIds = [...new Set(itemArgs.map((item) => String(item.product_id ?? '')).filter(Boolean))];
  const productNames = new Map<string, PendingProductName>();
  if (productIds.length) {
    const products = await database
      .get<CatalogProduct>('catalog_products')
      .query(Q.where('id', Q.oneOf(productIds)))
      .fetch();
    for (const product of products) productNames.set(product.id, { name: product.name, sku: product.sku ?? null });
  }

  const reason =
    state === 'rejected'
      ? command?.item.lastError?.trim() || row.rejectedReason?.trim() || DEFAULT_REJECTED_NEGOCIO_REASON
      : null;

  return {
    sync: { state, reason },
    preview: buildPendingNegocioPreview({ negocioId, negocio: negocioArgs, items: itemArgs, productNames }),
  };
}

/**
 * Ficha desde el teléfono. Si el negocio se creó sin señal y el servidor aún
 * no lo confirma, completa productos, plan de cuotas y datos del crédito con
 * el comando encolado (la fila local no los guarda) y marca su estado.
 */
export async function loadLocalNegocioDetail(negocioId: string): Promise<LocalNegocioDetail | null> {
  const [local, pending] = await Promise.all([
    fetchNegocioDetailFromLocal(negocioId),
    loadPendingNegocio(negocioId).catch(() => null),
  ]);
  if (!local) return null;
  if (!pending) return { ...local, pendingSync: null };
  const { preview } = pending;
  const items = local.items.length ? local.items : preview.items;
  return {
    ...local,
    negocio: {
      ...local.negocio,
      ...preview.negocioFields,
      products_subtotal:
        preview.negocioFields.products_subtotal != null
          ? Number(preview.negocioFields.products_subtotal)
          : local.negocio.products_subtotal,
    },
    items: items as LocalDetail['items'],
    cuotas: local.cuotas.length ? local.cuotas : (preview.cuotas as LocalDetail['cuotas']),
    pendingSync: pending.sync,
  };
}
