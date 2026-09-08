const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

import {
  getPublicCatalogProductBySlug,
  listAllPublicCatalogProductsInCategory,
  listPublicCatalogCategories,
  listPublicCatalogProducts,
  listPublicCatalogProductsByIds,
} from '../publicCatalogService';

function listingRow(index: number, totalCount: number) {
  return {
    catalog_product_id: `cp-${index}`,
    product_id: `p-${index}`,
    slug: `ficha-${index}`,
    display_name: `Ficha ${index}`,
    short_description: null,
    sale_price: 100,
    category_id: 'cat-1',
    category_name: 'Sala',
    brand_name: null,
    is_featured: false,
    cover_bucket: null,
    cover_storage_path: null,
    published_at: null,
    total_count: totalCount,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listPublicCatalogProducts', () => {
  it('pide 5 fichas por página, como usa el selector', async () => {
    mockRpc.mockResolvedValueOnce({ data: [listingRow(1, 12)], error: null });
    const result = await listPublicCatalogProducts({ search: 'nevera', categoryId: 'cat-1', page: 2 });
    expect(mockRpc).toHaveBeenCalledWith('get_public_catalog_listing', {
      search: 'nevera',
      p_category_id: 'cat-1',
      page: 2,
      page_size: 5,
    });
    expect(result.totalCount).toBe(12);
    expect(result.items).toHaveLength(1);
  });

  it('sin filas el total es cero', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(listPublicCatalogProducts()).resolves.toEqual({ items: [], totalCount: 0 });
  });
});

describe('listPublicCatalogProductsByIds', () => {
  it('no consulta con la lista vacía', async () => {
    await expect(listPublicCatalogProductsByIds([])).resolves.toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('resuelve el conjunto exacto de ids', async () => {
    mockRpc.mockResolvedValueOnce({ data: [listingRow(1, 1)], error: null });
    await listPublicCatalogProductsByIds(['p-1']);
    expect(mockRpc).toHaveBeenCalledWith('get_public_catalog_products_by_ids', { p_product_ids: ['p-1'] });
  });
});

describe('listAllPublicCatalogProductsInCategory', () => {
  it('recorre las páginas de 100 hasta completar el total', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => listingRow(index, 150));
    const page2 = Array.from({ length: 50 }, (_, index) => listingRow(100 + index, 150));
    mockRpc.mockResolvedValueOnce({ data: page1, error: null }).mockResolvedValueOnce({ data: page2, error: null });

    const items = await listAllPublicCatalogProductsInCategory('cat-1');

    expect(items).toHaveLength(150);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ page: 1, page_size: 100 });
    expect(mockRpc.mock.calls[1][1]).toMatchObject({ page: 2, page_size: 100 });
  });

  it('corta cuando una página vuelve vacía', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(listAllPublicCatalogProductsInCategory('cat-1')).resolves.toEqual([]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe('getPublicCatalogProductBySlug', () => {
  it('devuelve null cuando la ficha no está publicada', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(getPublicCatalogProductBySlug('inexistente')).resolves.toBeNull();
  });

  it('mapea el jsonb de la ficha', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { id: 'cp-1', productId: 'p-1', slug: 'ficha-1', displayName: 'Ficha', media: null, highlights: null, specifications: null, contentBlocks: null, relatedProducts: null },
      error: null,
    });
    const detail = await getPublicCatalogProductBySlug('ficha-1');
    expect(detail?.slug).toBe('ficha-1');
    expect(detail?.media).toEqual([]);
  });
});

describe('listPublicCatalogCategories', () => {
  it('mapea id y nombre', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'cat-1', name: 'Sala' }], error: null });
    await expect(listPublicCatalogCategories()).resolves.toEqual([{ id: 'cat-1', name: 'Sala' }]);
  });

  it('propaga el error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sin permiso' } });
    await expect(listPublicCatalogCategories()).rejects.toThrow('No fue posible cargar las categorías: sin permiso');
  });
});
