import type { CatalogRow, ItemRow, SectionRow, ShareLinkRow } from '@/components/catalogos/infrastructure/database';
import { mapCatalogRow, mapSections, mapShareLink, toListItem } from '../catalogMappers';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');

const catalogRow: CatalogRow = {
  id: 'cat-1',
  owner_id: 'user-1',
  internal_title: 'Lavadoras',
  public_title: 'Lavadoras Casa Ideal',
  introduction: null,
  cover_image_url: null,
  accent_color: '#1e3a8a',
  template: 'editorial',
  status: 'published',
  visibility: 'private',
  show_price: false,
  show_availability: false,
  show_sku: false,
  show_contact: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  archived_at: null,
};

const shareLinkRow: ShareLinkRow = {
  id: 'link-1',
  catalog_id: 'cat-1',
  catalog_version_id: 'ver-1',
  token: 'token',
  token_hash: 'a'.repeat(64),
  token_hint: 'abc123',
  label: 'Familia Pérez',
  expires_at: new Date(NOW + 3_600_000).toISOString(),
  revoked_at: null,
  created_by: 'user-1',
  created_at: '2026-09-02T00:00:00Z',
  first_viewed_at: null,
  last_viewed_at: null,
  view_count: 4,
};

describe('mapCatalogRow', () => {
  it('pasa a camelCase conservando estado y visibilidad', () => {
    const catalog = mapCatalogRow(catalogRow);
    expect(catalog.internalTitle).toBe('Lavadoras');
    expect(catalog.ownerId).toBe('user-1');
    expect(catalog.visibility).toBe('private');
    expect(catalog.showPrice).toBe(false);
  });
});

describe('mapSections', () => {
  it('agrupa los elementos bajo su capítulo', () => {
    const sections: SectionRow[] = [
      { id: 's-1', catalog_id: 'cat-1', title: 'Sala', kicker: null, body: null, image_url: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 's-2', catalog_id: 'cat-1', title: 'Alcoba', kicker: null, body: null, image_url: null, sort_order: 1, created_at: '', updated_at: '' },
    ];
    const items: ItemRow[] = [
      { id: 'i-1', catalog_id: 'cat-1', section_id: 's-1', item_type: 'product', reference_id: 'p-1', is_featured: true, sort_order: 0, created_at: '' },
      { id: 'i-2', catalog_id: 'cat-1', section_id: 's-2', item_type: 'category', reference_id: 'cat-sala', is_featured: false, sort_order: 0, created_at: '' },
    ];
    const mapped = mapSections(sections, items);
    expect(mapped[0].items).toHaveLength(1);
    expect(mapped[0].items[0].isFeatured).toBe(true);
    expect(mapped[1].items[0].itemType).toBe('category');
  });
});

describe('mapShareLink', () => {
  it('resuelve el número de versión y normaliza el contador', () => {
    const link = mapShareLink(shareLinkRow, new Map([['ver-1', 3]]));
    expect(link.versionNumber).toBe(3);
    expect(link.viewCount).toBe(4);
  });

  it('cae a la versión 1 cuando no se puede leer la versión (RLS en catálogos ajenos)', () => {
    expect(mapShareLink(shareLinkRow, new Map()).versionNumber).toBe(1);
  });
});

describe('toListItem', () => {
  it('marca como propio el catálogo del usuario y resume sus enlaces', () => {
    const shareLinks = [mapShareLink(shareLinkRow, new Map([['ver-1', 1]]))];
    const item = toListItem(catalogRow, { viewerId: 'user-1', shareLinks, now: NOW });
    expect(item.isOwner).toBe(true);
    expect(item.scope).toBe('own');
    expect(item.activeLinkCount).toBe(1);
    expect(item.totalViewCount).toBe(4);
  });

  it('un catálogo ajeno de visibilidad organization es «del equipo»', () => {
    const item = toListItem({ ...catalogRow, owner_id: 'otro', visibility: 'organization' }, { viewerId: 'user-1', shareLinks: [], now: NOW });
    expect(item.isOwner).toBe(false);
    expect(item.scope).toBe('organization');
  });

  it('un catálogo ajeno privado llegó por colaboración', () => {
    const item = toListItem({ ...catalogRow, owner_id: 'otro' }, { viewerId: 'user-1', shareLinks: [], now: NOW });
    expect(item.scope).toBe('shared');
  });
});
