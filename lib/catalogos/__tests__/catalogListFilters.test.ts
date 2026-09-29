import {
  catalogFilterItems,
  catalogStatusGroup,
  catalogTabItems,
  formatCatalogStatusSummary,
  isGlobalCatalog,
  matchesCatalogListFilter,
  matchesCatalogListQuery,
  normalizeCatalogQuery,
  splitCatalogList,
  summarizeCatalogStatuses,
} from '../catalogListFilters';
import type { PrivateCatalogListItem } from '../types';

function item(overrides: Partial<PrivateCatalogListItem> = {}): PrivateCatalogListItem {
  return {
    id: 'cat-1',
    ownerId: 'user-1',
    internalTitle: 'Lavadoras',
    publicTitle: 'Lavadoras Casa Ideal',
    introduction: null,
    coverImageUrl: null,
    accentColor: '#1e3a8a',
    template: 'editorial',
    status: 'published',
    visibility: 'private',
    showPrice: false,
    showAvailability: false,
    showSku: false,
    showContact: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    linkCount: 1,
    activeLinkCount: 1,
    totalViewCount: 2,
    nextExpiration: null,
    shareLinks: [],
    isOwner: true,
    scope: 'own',
    ...overrides,
  };
}

describe('matchesCatalogListFilter', () => {
  it('«Publicados» usa el estado derivado, no el de la base', () => {
    expect(matchesCatalogListFilter(item({ status: 'revoked', activeLinkCount: 1, linkCount: 2 }), 'published')).toBe(true);
    expect(matchesCatalogListFilter(item({ activeLinkCount: 0, linkCount: 1 }), 'published')).toBe(false);
  });

  it('«Borradores» mira el estado real de la base', () => {
    expect(matchesCatalogListFilter(item({ status: 'draft', linkCount: 0, activeLinkCount: 0 }), 'draft')).toBe(true);
    expect(matchesCatalogListFilter(item(), 'draft')).toBe(false);
  });

  it('«Todos» no filtra', () => {
    expect(matchesCatalogListFilter(item({ isOwner: false }), 'all')).toBe(true);
  });
});

describe('matchesCatalogListQuery', () => {
  it('busca en el nombre interno y en el título público, sin tildes ni mayúsculas', () => {
    const row = item({ internalTitle: 'Selección hogar', publicTitle: 'Tu hogar ideal' });
    expect(matchesCatalogListQuery(row, normalizeCatalogQuery('SELECCION'))).toBe(true);
    expect(matchesCatalogListQuery(row, normalizeCatalogQuery('ideal'))).toBe(true);
    expect(matchesCatalogListQuery(row, normalizeCatalogQuery('nevera'))).toBe(false);
  });

  it('la búsqueda vacía deja pasar todo', () => {
    expect(matchesCatalogListQuery(item(), '')).toBe(true);
  });
});

describe('splitCatalogList', () => {
  it('vendedor: lo propio en Catálogos y lo global ajeno en «Catálogos globales»', () => {
    const split = splitCatalogList([
      item({ id: 'a' }),
      item({ id: 'b', internalTitle: 'Envío rápido · Sofá' }),
      item({ id: 'c', isOwner: false, scope: 'organization', visibility: 'organization', ownerId: 'admin-1' }),
      // Compartido por colaboración: privado ajeno, no se muestra en el móvil.
      item({ id: 'd', isOwner: false, scope: 'shared', ownerId: 'user-3' }),
    ]);
    expect(split.editions.map((row) => row.id)).toEqual(['a']);
    expect(split.quickShares.map((row) => row.id)).toEqual(['b']);
    expect(split.globals.map((row) => row.id)).toEqual(['c']);
  });

  it('admin: la RLS le trae también lo privado ajeno, pero en el móvil solo ve lo global y sin repetir', () => {
    const split = splitCatalogList([
      item({ id: 'mio-global', visibility: 'organization' }),
      item({ id: 'ajeno-global', isOwner: false, scope: 'organization', visibility: 'organization', ownerId: 'seller-1' }),
      item({ id: 'ajeno-privado', isOwner: false, scope: 'shared', ownerId: 'seller-1' }),
      item({ id: 'ajeno-envio', isOwner: false, scope: 'organization', visibility: 'organization', ownerId: 'seller-1', internalTitle: 'Envío rápido · Mesa' }),
      item({ id: 'ajeno-borrador', isOwner: false, scope: 'organization', visibility: 'organization', status: 'draft', ownerId: 'seller-2' }),
    ]);
    // Un global propio sigue en su lista, nunca en «Catálogos globales».
    expect(split.editions.map((row) => row.id)).toEqual(['mio-global']);
    expect(split.globals.map((row) => row.id)).toEqual(['ajeno-global']);
    const shown = [...split.editions, ...split.quickShares, ...split.globals].map((row) => row.id);
    expect(new Set(shown).size).toBe(shown.length);
  });
});

describe('isGlobalCatalog', () => {
  it('solo lo publicado para todos que ya no es borrador', () => {
    expect(isGlobalCatalog({ visibility: 'organization', status: 'published' })).toBe(true);
    expect(isGlobalCatalog({ visibility: 'organization', status: 'draft' })).toBe(false);
    expect(isGlobalCatalog({ visibility: 'private', status: 'published' })).toBe(false);
  });
});

// Pedido del usuario (2026-09-29): en «Mis catálogos», la relación de
// borradores y publicados, con filtro rápido por estado.
describe('resumen y filtro por estado', () => {
  const borrador = item({ id: 'b', status: 'draft', linkCount: 0, activeLinkCount: 0 });
  const publicado = item({ id: 'p' });
  const publicadoSinEnlace = item({ id: 'p2', linkCount: 0, activeLinkCount: 0 });
  const vencido = item({ id: 'v', status: 'published', linkCount: 1, activeLinkCount: 0 });
  const revocado = item({ id: 'r', status: 'revoked', linkCount: 1, activeLinkCount: 0 });
  const archivado = item({ id: 'a', status: 'archived' });

  it('agrupa cada catálogo en borrador, publicado o vencido', () => {
    expect(catalogStatusGroup(borrador)).toBe('draft');
    expect(catalogStatusGroup(publicado)).toBe('published');
    expect(catalogStatusGroup(publicadoSinEnlace)).toBe('published');
    expect(catalogStatusGroup(vencido)).toBe('expired');
    expect(catalogStatusGroup(revocado)).toBe('expired');
    expect(catalogStatusGroup(archivado)).toBeNull();
  });

  it('cuenta y escribe la relación en una línea', () => {
    const summary = summarizeCatalogStatuses([borrador, publicado, publicadoSinEnlace, vencido, archivado]);
    expect(summary).toEqual({ draft: 1, published: 2, expired: 1 });
    expect(formatCatalogStatusSummary(summary)).toBe('1 borrador · 2 publicados · 1 vencido');
    expect(formatCatalogStatusSummary({ draft: 3, published: 8, expired: 0 })).toBe('3 borradores · 8 publicados');
  });

  it('«Vencidos» solo aparece en el filtro si hay alguno o ya está elegido', () => {
    const sin = { draft: 1, published: 1, expired: 0 };
    expect(catalogFilterItems(sin, 'all').map((option) => option.label)).toEqual(['Todos', 'Borradores', 'Publicados']);
    expect(catalogFilterItems(sin, 'expired').map((option) => option.value)).toContain('expired');
    expect(catalogFilterItems({ ...sin, expired: 2 }, 'all').map((option) => option.label)).toContain('Vencidos');
  });

  it('el filtro deja pasar solo su grupo', () => {
    const all = [borrador, publicado, vencido, revocado];
    expect(all.filter((row) => matchesCatalogListFilter(row, 'draft')).map((row) => row.id)).toEqual(['b']);
    expect(all.filter((row) => matchesCatalogListFilter(row, 'published')).map((row) => row.id)).toEqual(['p']);
    expect(all.filter((row) => matchesCatalogListFilter(row, 'expired')).map((row) => row.id)).toEqual(['v', 'r']);
  });
});

describe('catalogTabItems', () => {
  it('dos pestañas, cada una con su contador', () => {
    expect(catalogTabItems({ mine: 4, globals: 2 })).toEqual([
      { value: 'mine', label: 'Mis catálogos', badge: 4 },
      { value: 'globals', label: 'Globales', badge: 2 },
    ]);
  });
});
