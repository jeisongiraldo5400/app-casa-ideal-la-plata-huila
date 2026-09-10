import type { PublicCatalogListingItem, PublicCatalogProductDetail } from '../publicCatalogTypes';
import { buildListingIndex, buildMagazineSnapshot, collectSelectedSlugs, collectSelectionIds, matchListingItems } from '../snapshot';
import type { CatalogItem, CatalogSection, PrivateCatalog } from '../types';

const catalog: Pick<
  PrivateCatalog,
  'publicTitle' | 'introduction' | 'coverImageUrl' | 'accentColor' | 'template' | 'showPrice' | 'showAvailability' | 'showSku' | 'showContact'
> = {
  publicTitle: 'Público',
  introduction: null,
  coverImageUrl: null,
  accentColor: '#1e3a8a',
  template: 'editorial',
  showPrice: false,
  showAvailability: false,
  showSku: false,
  showContact: true,
};

function productItem(referenceId: string, isFeatured = false): CatalogItem {
  return { id: `item-${referenceId}`, itemType: 'product', referenceId, isFeatured, sortOrder: 0 };
}

function categoryItem(referenceId: string): CatalogItem {
  return { id: `item-${referenceId}`, itemType: 'category', referenceId, isFeatured: false, sortOrder: 0 };
}

function section(id: string, title: string, items: CatalogItem[] = []): CatalogSection {
  return { id, title, kicker: null, body: null, imageUrl: null, sortOrder: 0, items };
}

const listingItem: PublicCatalogListingItem = {
  catalogProductId: 'cp-1',
  productId: 'p-1',
  slug: 'sofa-lino',
  displayName: 'Sofá de lino',
  shortDescription: null,
  salePrice: 1000,
  categoryId: 'cat-sala',
  categoryName: 'Sala',
  brandName: null,
  isFeatured: false,
  coverImageUrl: null,
  publishedAt: '2026-09-01T00:00:00Z',
};

const productDetail = {
  id: 'cp-1',
  productId: 'p-1',
  slug: 'sofa-lino',
  displayName: 'Sofá de lino',
  media: [],
  highlights: [],
  specifications: [],
  contentBlocks: [],
  relatedProducts: [],
} as unknown as PublicCatalogProductDetail;

const PUBLISHED_AT = '2026-09-07T12:00:00.000Z';

describe('collectSelectionIds', () => {
  it('separa productos de categorías y deduplica', () => {
    const result = collectSelectionIds([
      section('s-1', 'Sala', [productItem('p-1'), categoryItem('cat-sala')]),
      section('s-2', 'Alcoba', [productItem('p-1'), productItem('p-2')]),
    ]);
    expect(result.productIds).toEqual(['p-1', 'p-2']);
    expect(result.categoryIds).toEqual(['cat-sala']);
  });
});

describe('matchListingItems y collectSelectedSlugs', () => {
  const index = buildListingIndex([listingItem], [['cat-sala', [listingItem]]]);

  it('un producto no publicado no resuelve a ninguna ficha', () => {
    expect(matchListingItems(index, 'product', 'p-desconocido')).toEqual([]);
  });

  it('una categoría se expande a sus fichas', () => {
    expect(matchListingItems(index, 'category', 'cat-sala')).toHaveLength(1);
  });

  it('un slug repetido en varias categorías se resuelve una sola vez', () => {
    const slugs = collectSelectedSlugs(
      [section('s-1', 'Sala', [productItem('p-1')]), section('s-2', 'Alcoba', [productItem('p-1')])],
      index
    );
    expect(slugs).toEqual(['sofa-lino']);
  });
});

describe('buildMagazineSnapshot', () => {
  const index = buildListingIndex([listingItem], [['cat-sala', [listingItem]]]);
  const detailBySlug = new Map([['sofa-lino', productDetail]]);

  it('devuelve un snapshot renderizable de una edición sin categorías, en vez de lanzar', () => {
    const result = buildMagazineSnapshot({ catalog, sections: [], index, detailBySlug, publishedAt: PUBLISHED_AT });
    expect(result.snapshot.sections).toEqual([]);
    expect(result.snapshot.catalog.publicTitle).toBe('Público');
    expect(result.blockers).toEqual(['La edición no tiene categorías todavía.']);
  });

  it('omite los productos sin ficha publicada y lo reporta como bloqueo', () => {
    const result = buildMagazineSnapshot({
      catalog,
      sections: [section('s-1', 'Sala', [productItem('p-desconocido')])],
      index,
      detailBySlug,
      publishedAt: PUBLISHED_AT,
    });
    expect(result.snapshot.sections[0].products).toEqual([]);
    expect(result.blockers).toHaveLength(1);
  });

  it('marca `featured` por elemento, aunque la ficha se repita', () => {
    const result = buildMagazineSnapshot({
      catalog,
      sections: [section('s-1', 'Sala', [productItem('p-1', true)]), section('s-2', 'Alcoba', [productItem('p-1')])],
      index,
      detailBySlug,
      publishedAt: PUBLISHED_AT,
    });
    expect(result.snapshot.sections[0].products[0].featured).toBe(true);
    expect(result.snapshot.sections[1].products[0].featured).toBe(false);
    expect(result.blockers).toEqual([]);
  });

  it('expande una categoría a sus fichas publicadas', () => {
    const result = buildMagazineSnapshot({
      catalog,
      sections: [section('s-1', 'Sala', [categoryItem('cat-sala')])],
      index,
      detailBySlug,
      publishedAt: PUBLISHED_AT,
    });
    expect(result.snapshot.sections[0].products).toHaveLength(1);
  });

  it('conserva la forma del contrato que lee la revista', () => {
    const result = buildMagazineSnapshot({
      catalog,
      sections: [section('s-1', 'Sala', [productItem('p-1')])],
      index,
      detailBySlug,
      publishedAt: PUBLISHED_AT,
    });
    expect(result.snapshot.schemaVersion).toBe(1);
    expect(result.snapshot.publishedAt).toBe(PUBLISHED_AT);
    expect(Object.keys(result.snapshot.catalog).sort()).toEqual(
      ['accentColor', 'coverImageUrl', 'introduction', 'publicTitle', 'showAvailability', 'showContact', 'showPrice', 'showSku', 'template'].sort()
    );
    expect(Object.keys(result.snapshot.sections[0]).sort()).toEqual(['body', 'id', 'imageUrl', 'kicker', 'products', 'title'].sort());
  });
});
