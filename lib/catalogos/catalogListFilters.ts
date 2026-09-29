import { pluralize } from './labels';
import { isQuickShareCatalog } from './quickShare';
import { catalogDisplayStatus } from './shareLinks';
import type { PrivateCatalogListItem } from './types';

/**
 * En el móvil hay dos listas, cada una en su pestaña de Catálogos (pedido del
 * usuario, 2026-09-29): «Mis catálogos», con SOLO lo propio, y «Globales», con
 * lo que otras personas publicaron para todos. Nunca se mezclan en la misma
 * lista. Lo privado ajeno (que la RLS le devuelve al administrador) y los
 * envíos rápidos ajenos no se muestran en el móvil: viven en el panel web.
 */
export type CatalogTab = 'mine' | 'globals';

export function catalogTabItems(counts: { mine: number; globals: number }): { value: CatalogTab; label: string; badge: number }[] {
  return [
    { value: 'mine', label: 'Mis catálogos', badge: counts.mine },
    { value: 'globals', label: 'Globales', badge: counts.globals },
  ];
}

/** Filtro por estado de «Mis catálogos». */
export type CatalogListFilter = 'all' | 'draft' | 'published' | 'expired';

/** Grupo de estado de un catálogo para el resumen y el filtro. */
export type CatalogStatusGroup = Exclude<CatalogListFilter, 'all'>;

/**
 * Borrador = nunca compartido (estado real de la base). Publicado = tiene un
 * enlace vigente, o está publicado sin enlaces. Vencido = ya no le queda
 * ningún enlace vigente (vencidos o revocados desde la web).
 */
export function catalogStatusGroup(item: PrivateCatalogListItem): CatalogStatusGroup | null {
  if (item.status === 'draft') return 'draft';
  switch (catalogDisplayStatus(item)) {
    case 'published':
      return 'published';
    case 'expired':
    case 'revoked':
      return 'expired';
    default:
      return null;
  }
}

export type CatalogStatusSummary = Record<CatalogStatusGroup, number>;

export function summarizeCatalogStatuses(items: readonly PrivateCatalogListItem[]): CatalogStatusSummary {
  const summary: CatalogStatusSummary = { draft: 0, published: 0, expired: 0 };
  for (const item of items) {
    const group = catalogStatusGroup(item);
    if (group) summary[group] += 1;
  }
  return summary;
}

/** «3 borradores · 8 publicados», con « · 1 vencido» solo si hay. */
export function formatCatalogStatusSummary(summary: CatalogStatusSummary): string {
  const parts = [
    pluralize(summary.draft, 'borrador', 'borradores'),
    pluralize(summary.published, 'publicado', 'publicados'),
  ];
  if (summary.expired > 0) parts.push(pluralize(summary.expired, 'vencido', 'vencidos'));
  return parts.join(' · ');
}

/** Opciones del filtro; «Vencidos» solo aparece si hay alguno (o si ya está elegido). */
export function catalogFilterItems(summary: CatalogStatusSummary, current: CatalogListFilter): { value: CatalogListFilter; label: string }[] {
  const items: { value: CatalogListFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'draft', label: 'Borradores' },
    { value: 'published', label: 'Publicados' },
  ];
  if (summary.expired > 0 || current === 'expired') items.push({ value: 'expired', label: 'Vencidos' });
  return items;
}

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
  /** Propios creados por «Enviar productos»: van aparte, plegados. */
  quickShares: PrivateCatalogListItem[];
  /** De otras personas, publicados para todos, sin envíos rápidos: pestaña «Globales». */
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
  return filter === 'all' || catalogStatusGroup(item) === filter;
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
