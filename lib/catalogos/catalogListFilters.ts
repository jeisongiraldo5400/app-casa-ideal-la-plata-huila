import { isQuickShareCatalog } from './quickShare';
import { catalogDisplayStatus } from './shareLinks';
import type { PrivateCatalogListItem } from './types';

/**
 * La pestaña Catálogos muestra SOLO lo propio; lo de otras personas tiene su
 * pantalla («Catálogos del equipo»). Por eso ya no hay filtro «Míos».
 */
export type CatalogListFilter = 'all' | 'published' | 'draft';

export const CATALOG_LIST_FILTERS: { value: CatalogListFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Compartidos' },
  { value: 'draft', label: 'Borradores' },
];

export type SplitCatalogList = {
  /** Catálogos propios armados a mano: la lista principal. */
  editions: PrivateCatalogListItem[];
  /** Propios creados por «Enviar un producto»: van aparte, plegados. */
  quickShares: PrivateCatalogListItem[];
  /** De otras personas (publicados al equipo, compartidos o, al admin, todos). */
  others: PrivateCatalogListItem[];
};

/** Separa lo propio de lo ajeno, y lo propio en catálogos y envíos de un producto. */
export function splitCatalogList(list: readonly PrivateCatalogListItem[]): SplitCatalogList {
  const split: SplitCatalogList = { editions: [], quickShares: [], others: [] };
  for (const item of list) {
    if (!item.isOwner) split.others.push(item);
    else if (isQuickShareCatalog(item.internalTitle)) split.quickShares.push(item);
    else split.editions.push(item);
  }
  return split;
}

export type OwnerGroup = { ownerId: string; ownerName: string; data: PrivateCatalogListItem[] };

/**
 * Agrupa por quien lo creó (orden alfabético del nombre). Dentro de cada grupo
 * se conserva el orden de entrada (lo más reciente primero).
 */
export function groupCatalogsByOwner(list: readonly PrivateCatalogListItem[], names: ReadonlyMap<string, string>): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();
  for (const item of list) {
    const group = groups.get(item.ownerId);
    if (group) group.data.push(item);
    else groups.set(item.ownerId, { ownerId: item.ownerId, ownerName: names.get(item.ownerId) ?? 'Usuario sin nombre', data: [item] });
  }
  return [...groups.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'es'));
}

export function matchesCatalogListFilter(item: PrivateCatalogListItem, filter: CatalogListFilter): boolean {
  switch (filter) {
    case 'published':
      return catalogDisplayStatus(item) === 'published';
    case 'draft':
      return item.status === 'draft';
    default:
      return true;
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** `query` ya normalizada con `normalizeCatalogQuery`. */
export function matchesCatalogListQuery(item: Pick<PrivateCatalogListItem, 'internalTitle' | 'publicTitle'>, query: string): boolean {
  if (!query) return true;
  return normalize(`${item.internalTitle} ${item.publicTitle}`).includes(query);
}

export function normalizeCatalogQuery(value: string): string {
  return normalize(value.trim());
}
