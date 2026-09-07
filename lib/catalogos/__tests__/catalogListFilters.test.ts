import { matchesCatalogListFilter, matchesCatalogListQuery, normalizeCatalogQuery } from '../catalogListFilters';
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
  it('«Míos» deja solo los propios', () => {
    expect(matchesCatalogListFilter(item(), 'own')).toBe(true);
    expect(matchesCatalogListFilter(item({ isOwner: false, scope: 'organization' }), 'own')).toBe(false);
  });

  it('«Compartidos» usa el estado derivado, no el de la base', () => {
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
