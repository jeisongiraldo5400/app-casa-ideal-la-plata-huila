import type { PublicCatalogListingItem, PublicCatalogProductDetail } from '../publicCatalogTypes';
import { buildListingIndex, buildMagazineSnapshot, collectSelectedSlugs, collectSelectionIds, dedupeAcrossSections, matchListingItems } from '../snapshot';
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
  stockQuantity: 2,
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

  it('una ficha repetida sale solo en la primera sección (como el web) y conserva `featured`', () => {
    const result = buildMagazineSnapshot({
      catalog,
      sections: [section('s-1', 'Sala', [productItem('p-1', true)]), section('s-2', 'Alcoba', [productItem('p-1')])],
      index,
      detailBySlug,
      publishedAt: PUBLISHED_AT,
    });
    expect(result.snapshot.sections[0].products[0].featured).toBe(true);
    expect(result.snapshot.sections[1].products).toEqual([]);
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

describe('categorías completas y repetidos (alineado con snapshot.server.ts del web)', () => {
  const listingFor = (n: number): PublicCatalogListingItem => ({ ...listingItem, catalogProductId: `cp-${n}`, productId: `p-${n}`, slug: `ficha-${n}` });
  const detailFor = (n: number) => ({ ...productDetail, id: `cp-${n}`, productId: `p-${n}`, slug: `ficha-${n}` }) as PublicCatalogProductDetail;
  const all = Array.from({ length: 150 }, (_, index) => listingFor(index + 1));
  const details = new Map(all.map((item, index) => [item.slug, detailFor(index + 1)]));

  it('una categoría «siempre al día» entra completa en el enlace, también más allá de 100 fichas', () => {
    const index = buildListingIndex([], [['cat-sala', all]]);
    const { snapshot, blockers } = buildMagazineSnapshot({
      catalog,
      sections: [section('s-1', 'Sala', [categoryItem('cat-sala')])],
      index,
      detailBySlug: details,
      publishedAt: PUBLISHED_AT,
    });
    expect(blockers).toEqual([]);
    expect(snapshot.sections[0].products).toHaveLength(150);
  });

  it('un producto suelto que también viene en su categoría sale una sola vez, en la primera sección, y conserva el destacado', () => {
    const index = buildListingIndex([listingFor(1), listingFor(2)], [['cat-sala', all.slice(0, 3)]]);
    const { snapshot, warnings } = buildMagazineSnapshot({
      catalog,
      sections: [
        section('s-1', 'Destacados', [productItem('p-2')]),
        section('s-2', 'Sala', [categoryItem('cat-sala'), productItem('p-2', true)]),
        section('s-3', 'Repetida', [productItem('p-1')]),
      ],
      index,
      detailBySlug: details,
      publishedAt: PUBLISHED_AT,
    });
    expect(snapshot.sections.map((item) => item.products.map((product) => product.productId))).toEqual([['p-2'], ['p-1', 'p-3'], []]);
    expect(snapshot.sections[0].products[0].featured).toBe(true);
    expect(warnings).toEqual(['La categoría «Repetida» solo repite productos de otras categorías y no aparecerá.']);
  });

  it('dedupeAcrossSections cuenta los descartados por grupo', () => {
    expect(dedupeAcrossSections([['a', 'b'], ['b', 'c', 'a']], (value) => value)).toEqual({ groups: [['a', 'b'], ['c']], repeated: [0, 2] });
  });
});
