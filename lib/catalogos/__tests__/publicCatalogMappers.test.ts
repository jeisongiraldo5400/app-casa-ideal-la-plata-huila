import {
  mapPublicCatalogCategoryRow,
  mapPublicCatalogListingRow,
  mapPublicCatalogProductDetail,
  type PublicCatalogListingRow,
  type PublicCatalogProductDetailRaw,
} from '../publicCatalogMappers';

const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://catalog.example.supabase.co';
});

afterEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
});

const listingRow: PublicCatalogListingRow = {
  catalog_product_id: 'cp-1',
  product_id: 'p-1',
  slug: 'producto-1',
  display_name: 'Producto 1',
  short_description: 'Corta',
  sale_price: 1000,
  category_id: 'cat-1',
  category_name: 'Categoría',
  brand_name: 'Marca',
  is_featured: true,
  cover_bucket: 'catalog-images',
  cover_storage_path: 'cp-1/portada.jpg',
  published_at: '2026-09-01T00:00:00Z',
  total_count: 5,
};

describe('mapPublicCatalogListingRow', () => {
  it('mapea snake_case a camelCase y resuelve la portada', () => {
    const result = mapPublicCatalogListingRow(listingRow);
    expect(result.catalogProductId).toBe('cp-1');
    expect(result.displayName).toBe('Producto 1');
    expect(result.coverImageUrl).toBe('https://catalog.example.supabase.co/storage/v1/object/public/catalog-images/cp-1/portada.jpg');
  });

  it('deja coverImageUrl en null sin portada', () => {
    expect(mapPublicCatalogListingRow({ ...listingRow, cover_bucket: null, cover_storage_path: null }).coverImageUrl).toBeNull();
  });

  it('deja coverImageUrl en null si el bucket no es catalog-images', () => {
    expect(mapPublicCatalogListingRow({ ...listingRow, cover_bucket: 'catalog-videos', cover_storage_path: 'cp-1/poster.jpg' }).coverImageUrl).toBeNull();
  });
});

describe('mapPublicCatalogCategoryRow', () => {
  it('mapea id y nombre tal cual', () => {
    expect(mapPublicCatalogCategoryRow({ id: 'cat-1', name: 'Cocina' })).toEqual({ id: 'cat-1', name: 'Cocina' });
  });
});

function buildRawDetail(overrides: Partial<PublicCatalogProductDetailRaw> = {}): PublicCatalogProductDetailRaw {
  return {
    id: 'cp-1',
    productId: 'p-1',
    slug: 'producto-1',
    displayName: 'Producto 1',
    subtitle: null,
    shortDescription: null,
    marketingDescription: null,
    seoTitle: null,
    seoDescription: null,
    salePrice: 1000,
    isFeatured: false,
    publishedAt: '2026-09-01T00:00:00Z',
    category: { id: 'cat-1', name: 'Categoría' },
    brand: { id: 'brand-1', name: 'Marca' },
    color: null,
    media: null,
    highlights: null,
    specifications: null,
    contentBlocks: null,
    relatedProducts: null,
    ...overrides,
  };
}

describe('mapPublicCatalogProductDetail', () => {
  it('trata los arrays null del jsonb como listas vacías', () => {
    const result = mapPublicCatalogProductDetail(buildRawDetail());
    expect(result.media).toEqual([]);
    expect(result.highlights).toEqual([]);
    expect(result.specifications).toEqual([]);
    expect(result.contentBlocks).toEqual([]);
    expect(result.relatedProducts).toEqual([]);
  });

  it('resuelve publicUrl para imágenes y videos de buckets públicos', () => {
    const result = mapPublicCatalogProductDetail(
      buildRawDetail({
        media: [
          { id: 'm-1', type: 'IMAGE', bucket: 'catalog-images', storagePath: 'cp-1/foto.jpg', thumbnailPath: null, posterPath: null, title: null, altText: null, isCover: true, sortOrder: 0, metadata: null },
          { id: 'm-2', type: 'VIDEO', bucket: 'catalog-videos', storagePath: 'cp-1/video.mp4', thumbnailPath: null, posterPath: null, title: null, altText: null, isCover: false, sortOrder: 1, metadata: null },
        ],
      })
    );
    expect(result.media[0].publicUrl).toBe('https://catalog.example.supabase.co/storage/v1/object/public/catalog-images/cp-1/foto.jpg');
    expect(result.media[1].publicUrl).toBe('https://catalog.example.supabase.co/storage/v1/object/public/catalog-videos/cp-1/video.mp4');
  });

  it('deja publicUrl en null para IMAGE_360 (su storagePath es un prefijo, no un objeto)', () => {
    const result = mapPublicCatalogProductDetail(
      buildRawDetail({
        media: [
          { id: 'm-3', type: 'IMAGE_360', bucket: 'catalog-images', storagePath: 'cp-1/360/seq-1', thumbnailPath: null, posterPath: null, title: null, altText: null, isCover: false, sortOrder: 0, metadata: { frameCount: 24 } },
        ],
      })
    );
    expect(result.media[0].publicUrl).toBeNull();
  });

  it('resuelve la portada de los productos relacionados', () => {
    const result = mapPublicCatalogProductDetail(
      buildRawDetail({
        relatedProducts: [
          {
            relationType: 'similar',
            sortOrder: 0,
            product: { id: 'cp-2', productId: 'p-2', slug: 'producto-2', displayName: 'Producto 2', salePrice: 2000, coverBucket: 'catalog-images', coverStoragePath: 'cp-2/portada.jpg' },
          },
        ],
      })
    );
    expect(result.relatedProducts[0].product.coverImageUrl).toBe(
      'https://catalog.example.supabase.co/storage/v1/object/public/catalog-images/cp-2/portada.jpg'
    );
  });
});
