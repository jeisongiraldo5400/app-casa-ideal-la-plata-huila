import { isQuickShareCatalog } from './quickShare';
import { catalogDisplayStatus } from './shareLinks';
import type { PrivateCatalogListItem } from './types';

/**
 * En el móvil hay solo dos listas (decisión del usuario, 2026-09-28): la
 * pestaña Catálogos, con SOLO lo propio, y «Catálogos globales», con lo que
 * otras personas publicaron para todos. Lo privado ajeno (que la RLS le
 * devuelve al administrador) y los envíos rápidos ajenos no se muestran en el
 * móvil: viven en el panel web. Por eso ya no hay filtro «Míos».
 */
export type CatalogListFilter = 'all' | 'published' | 'draft';

export const CATALOG_LIST_FILTERS: { value: CatalogListFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Compartidos' },
  { value: 'draft', label: 'Borradores' },
];

/**
 * «Global»: publicado para todos (`visibility = 'organization'` y ya no es
 * borrador), exactamente lo que `can_read_catalog` deja ver a cualquiera con
 * `catalog.access`. Solo lo pone «Publicar como global» en el panel web.
 */
export function isGlobalCatalog(catalog: Pick<PrivateCatalogListItem, 'visibility' | 'status'>): boolean {
  return catalog.visibility === 'organization' && catalog.status !== 'draft';
}

export type SplitCatalogList = {
  /** Catálogos propios armados a mano: la lista principal. */
  editions: PrivateCatalogListItem[];
  /** Propios creados por «Enviar un producto»: van aparte, plegados. */
  quickShares: PrivateCatalogListItem[];
  /** De otras personas, publicados para todos, sin envíos rápidos: «Catálogos globales». */
  globals: PrivateCatalogListItem[];
};

/** Separa lo propio (catálogos y envíos de un producto) de lo global ajeno; lo demás se descarta. */
export function splitCatalogList(list: readonly PrivateCatalogListItem[]): SplitCatalogList {
  const split: SplitCatalogList = { editions: [], quickShares: [], globals: [] };
  for (const item of list) {
    if (!item.isOwner) {
      if (isGlobalCatalog(item) && !isQuickShareCatalog(item.internalTitle)) split.globals.push(item);
    } else if (isQuickShareCatalog(item.internalTitle)) split.quickShares.push(item);
    else split.editions.push(item);
  }
  return split;
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
