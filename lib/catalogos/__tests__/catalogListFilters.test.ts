import { groupCatalogsByOwner, matchesCatalogListFilter, matchesCatalogListQuery, normalizeCatalogQuery, splitCatalogList } from '../catalogListFilters';
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

describe('splitCatalogList', () => {
  it('separa lo propio, los envíos de un producto y lo de otras personas', () => {
    const split = splitCatalogList([
      item({ id: 'a' }),
      item({ id: 'b', internalTitle: 'Envío rápido · Sofá' }),
      item({ id: 'c', isOwner: false, scope: 'organization', ownerId: 'user-2' }),
      item({ id: 'd', isOwner: false, scope: 'shared', ownerId: 'user-3', internalTitle: 'Envío rápido · Mesa' }),
    ]);
    expect(split.editions.map((row) => row.id)).toEqual(['a']);
    expect(split.quickShares.map((row) => row.id)).toEqual(['b']);
    // Lo ajeno nunca se mezcla con lo propio, sea o no un envío rápido.
    expect(split.others.map((row) => row.id)).toEqual(['c', 'd']);
  });
});

describe('groupCatalogsByOwner', () => {
  it('agrupa por creador, en orden alfabético, conservando el orden de cada grupo', () => {
    const groups = groupCatalogsByOwner(
      [item({ id: '1', ownerId: 'b' }), item({ id: '2', ownerId: 'a' }), item({ id: '3', ownerId: 'b' })],
      new Map([
        ['a', 'Zoila'],
        ['b', 'Álvaro'],
      ])
    );
    expect(groups.map((group) => [group.ownerName, group.data.map((row) => row.id)])).toEqual([
      ['Álvaro', ['1', '3']],
      ['Zoila', ['2']],
    ]);
  });

  it('un perfil sin nombre no esconde sus catálogos', () => {
    expect(groupCatalogsByOwner([item({ ownerId: 'x' })], new Map())[0]).toMatchObject({ ownerName: 'Usuario sin nombre' });
  });
});
