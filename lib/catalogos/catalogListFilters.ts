import { catalogDisplayStatus } from './shareLinks';
import type { PrivateCatalogListItem } from './types';

export type CatalogListFilter = 'all' | 'own' | 'published' | 'draft';

export const CATALOG_LIST_FILTERS: { value: CatalogListFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'own', label: 'Míos' },
  { value: 'published', label: 'Compartidos' },
  { value: 'draft', label: 'Borradores' },
];

export function matchesCatalogListFilter(item: PrivateCatalogListItem, filter: CatalogListFilter): boolean {
  switch (filter) {
    case 'own':
      return item.isOwner;
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
