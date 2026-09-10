const mockListPublicCatalogProductsByIds = jest.fn();
const mockListAllPublicCatalogProductsInCategory = jest.fn();
const mockGetPublicCatalogProductBySlug = jest.fn();

jest.mock('../publicCatalogService', () => ({
  listPublicCatalogProductsByIds: (...args: unknown[]) => mockListPublicCatalogProductsByIds(...args),
  listAllPublicCatalogProductsInCategory: (...args: unknown[]) => mockListAllPublicCatalogProductsInCategory(...args),
  getPublicCatalogProductBySlug: (...args: unknown[]) => mockGetPublicCatalogProductBySlug(...args),
}));

import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { analyzeCatalogSnapshot, buildCatalogSnapshot } from '../catalogSnapshotService';

const listingItem = {
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
  publishedAt: null,
};

const productDetail = { id: 'cp-1', productId: 'p-1', slug: 'sofa-lino', displayName: 'Sofá de lino', media: [], highlights: [], specifications: [], contentBlocks: [], relatedProducts: [] };

function detail(sections: PrivateCatalogDetail['sections']): PrivateCatalogDetail {
  return {
    id: 'cat-1',
    ownerId: 'user-1',
    internalTitle: 'Interno',
    publicTitle: 'Público',
    introduction: null,
    coverImageUrl: null,
    accentColor: '#1e3a8a',
    template: 'editorial',
    status: 'draft',
    visibility: 'private',
    showPrice: false,
    showAvailability: false,
    showSku: false,
    showContact: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    sections,
    shareLinks: [],
  };
}

function section(id: string, title: string, items: PrivateCatalogDetail['sections'][number]['items']) {
  return { id, title, kicker: null, body: null, imageUrl: null, sortOrder: 0, items };
}

function productItem(referenceId: string, isFeatured = false) {
  return { id: `item-${referenceId}`, itemType: 'product' as const, referenceId, isFeatured, sortOrder: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListPublicCatalogProductsByIds.mockImplementation(async (ids: string[]) => (ids.includes('p-1') ? [listingItem] : []));
  mockListAllPublicCatalogProductsInCategory.mockImplementation(async (categoryId: string) => (categoryId === 'cat-sala' ? [listingItem] : []));
  mockGetPublicCatalogProductBySlug.mockResolvedValue(productDetail);
});

describe('analyzeCatalogSnapshot', () => {
  it('devuelve un snapshot renderizable de una edición sin categorías, en vez de lanzar', async () => {
    const result = await analyzeCatalogSnapshot(detail([]));
    expect(result.snapshot.sections).toEqual([]);
    expect(result.blockers).toEqual(['La edición no tiene categorías todavía.']);
  });

  it('resuelve cada ficha una sola vez aunque aparezca en varios capítulos', async () => {
    const result = await analyzeCatalogSnapshot(
      detail([section('s-1', 'Sala', [productItem('p-1', true)]), section('s-2', 'Alcoba', [productItem('p-1')])])
    );
    expect(mockGetPublicCatalogProductBySlug).toHaveBeenCalledTimes(1);
    expect(result.snapshot.sections[0].products[0].featured).toBe(true);
    expect(result.snapshot.sections[1].products[0].featured).toBe(false);
    expect(result.blockers).toEqual([]);
  });

  it('expande una categoría seleccionada', async () => {
    const result = await analyzeCatalogSnapshot(
      detail([section('s-1', 'Sala', [{ id: 'item-cat', itemType: 'category', referenceId: 'cat-sala', isFeatured: false, sortOrder: 0 }])])
    );
    expect(mockListAllPublicCatalogProductsInCategory).toHaveBeenCalledWith('cat-sala');
    expect(result.snapshot.sections[0].products).toHaveLength(1);
  });

  it('omite las fichas que ya no están publicadas', async () => {
    mockGetPublicCatalogProductBySlug.mockResolvedValueOnce(null);
    const result = await analyzeCatalogSnapshot(detail([section('s-1', 'Sala', [productItem('p-1')])]));
    expect(result.snapshot.sections[0].products).toEqual([]);
    expect(result.blockers).toHaveLength(1);
  });

  it('informa del progreso de resolución de fichas', async () => {
    const onProgress = jest.fn();
    await analyzeCatalogSnapshot(detail([section('s-1', 'Sala', [productItem('p-1')])]), onProgress);
    expect(onProgress).toHaveBeenCalledWith({ resolved: 0, total: 1 });
    expect(onProgress).toHaveBeenLastCalledWith({ resolved: 1, total: 1 });
  });
});

describe('buildCatalogSnapshot', () => {
  it('lanza con los motivos cuando la edición no se puede publicar', async () => {
    await expect(buildCatalogSnapshot(detail([]))).rejects.toThrow('La edición no tiene categorías todavía.');
  });

  it('devuelve el snapshot cuando está lista', async () => {
    const snapshot = await buildCatalogSnapshot(detail([section('s-1', 'Sala', [productItem('p-1')])]));
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.sections[0].products).toHaveLength(1);
  });
});
