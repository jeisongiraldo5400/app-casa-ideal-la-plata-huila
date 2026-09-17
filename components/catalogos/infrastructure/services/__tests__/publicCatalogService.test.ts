const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

import {
  getPublicCatalogProductBySlug,
  getPublicCatalogProductDetails,
  listPublicCatalogCategoryPreview,
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
    stock_quantity: index === 0 ? 0 : '4',
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
  mockRpc.mockReset();
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

function rawDetail(slug: string) {
  return { id: `cp-${slug}`, productId: `p-${slug}`, slug, displayName: 'Ficha', media: null, highlights: null, specifications: null, contentBlocks: null, relatedProducts: null };
}

/**
 * Responde por nombre de RPC. Con `batch` el RPC por lote contesta (el slug
 * real llega en mayúsculas para probar el cruce); sin él falla como si la
 * migración 20261108120000 no estuviera aplicada.
 */
function mockDetailRpc(stock: Record<string, unknown>, missing: string[] = [], batch = true) {
  mockRpc.mockImplementation(async (name: string, args: { product_slug: string; p_slugs?: string[] }) => {
    if (name === 'get_public_catalog_products_detail') {
      if (!batch) return { data: null, error: { code: 'PGRST202', message: 'no existe' } };
      return {
        data: (args.p_slugs ?? [])
          .filter((slug) => !missing.includes(slug))
          .map((slug) => ({ slug: slug.toUpperCase(), detail: { ...rawDetail(slug), stockQuantity: String(stock[slug] ?? 0) } })),
        error: null,
      };
    }
    if (name === 'get_public_catalog_product') {
      return { data: missing.includes(args.product_slug) ? null : rawDetail(args.product_slug), error: null };
    }
    if (name === 'get_public_catalog_product_stock') return { data: stock[args.product_slug] ?? 0, error: null };
    throw new Error(`RPC inesperado ${name}`);
  });
}

describe('mapeo de existencias del listado', () => {
  it('convierte stock_quantity (numeric) a número', async () => {
    mockRpc.mockResolvedValueOnce({ data: [listingRow(0, 2), listingRow(1, 2)], error: null });
    const { items } = await listPublicCatalogProducts();
    expect(items.map((item) => item.stockQuantity)).toEqual([0, 4]);
  });
});

describe('listPublicCatalogCategoryPreview', () => {
  it('pide solo la primera página con el tamaño de la muestra', async () => {
    mockRpc.mockResolvedValueOnce({ data: [listingRow(1, 30)], error: null });
    const preview = await listPublicCatalogCategoryPreview('cat-1', 8);
    expect(mockRpc).toHaveBeenCalledWith('get_public_catalog_listing', { search: '', p_category_id: 'cat-1', page: 1, page_size: 8 });
    expect(preview.totalCount).toBe(30);
  });
});

describe('getPublicCatalogProductBySlug', () => {
  it('devuelve null cuando la ficha no está publicada', async () => {
    mockDetailRpc({}, ['inexistente']);
    await expect(getPublicCatalogProductBySlug('inexistente')).resolves.toBeNull();
  });

  it('mapea el jsonb de la ficha e incrusta las existencias, como el web', async () => {
    mockDetailRpc({ 'ficha-1': '7' });
    const detail = await getPublicCatalogProductBySlug('ficha-1');
    expect(detail?.slug).toBe('ficha-1');
    expect(detail?.media).toEqual([]);
    expect(detail?.stockQuantity).toBe(7);
    expect(mockRpc).toHaveBeenCalledWith('get_public_catalog_product_stock', { product_slug: 'ficha-1' });
  });

  it('sin existencias queda en 0 (la revista mostrará «Producto agotado»)', async () => {
    mockDetailRpc({ 'ficha-1': null });
    await expect(getPublicCatalogProductBySlug('ficha-1')).resolves.toMatchObject({ stockQuantity: 0 });
  });

  it('propaga el fallo de disponibilidad', async () => {
    mockRpc.mockImplementation(async (name: string) =>
      name === 'get_public_catalog_product' ? { data: rawDetail('ficha-1'), error: null } : { data: null, error: { message: 'caído' } }
    );
    await expect(getPublicCatalogProductBySlug('ficha-1')).rejects.toThrow('No fue posible cargar la disponibilidad del producto: caído');
  });
});

describe('getPublicCatalogProductDetails', () => {
  it('pide todo en un lote, indexa por el slug pedido y omite los no publicados', async () => {
    mockDetailRpc({ a: 1, b: 0 }, ['c']);
    const result = await getPublicCatalogProductDetails(['a', 'b', 'a', 'c']);
    expect([...result.keys()]).toEqual(['a', 'b']);
    expect(result.get('a')?.stockQuantity).toBe(1);
    expect(result.get('b')?.stockQuantity).toBe(0);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_public_catalog_products_detail', { p_slugs: ['a', 'b', 'c'] });
  });

  it('sin el RPC por lote vuelve a ficha y existencias por slug', async () => {
    mockDetailRpc({ a: 1, b: 0 }, ['c'], false);
    const result = await getPublicCatalogProductDetails(['a', 'b', 'a', 'c']);
    expect([...result.keys()]).toEqual(['a', 'b']);
    expect(result.get('b')?.stockQuantity).toBe(0);
    expect(mockRpc.mock.calls.filter(([name]) => name === 'get_public_catalog_product')).toHaveLength(3);
  });

  it('parte en lotes de 100', async () => {
    mockDetailRpc({});
    const slugs = Array.from({ length: 150 }, (_, index) => `s${index}`);
    const result = await getPublicCatalogProductDetails(slugs);
    expect(result.size).toBe(150);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('informa del progreso', async () => {
    mockDetailRpc({});
    const onProgress = jest.fn();
    await getPublicCatalogProductDetails(['a', 'b'], onProgress);
    expect(onProgress).toHaveBeenNthCalledWith(1, { resolved: 0, total: 2 });
    expect(onProgress).toHaveBeenLastCalledWith({ resolved: 2, total: 2 });
  });

  it('no pide nada sin slugs', async () => {
    await expect(getPublicCatalogProductDetails([])).resolves.toEqual(new Map());
    expect(mockRpc).not.toHaveBeenCalled();
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
