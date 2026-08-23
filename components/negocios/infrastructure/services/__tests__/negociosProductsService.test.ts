const mockBuilder: Record<string, jest.Mock> = {};
const mockFrom = jest.fn((_table: string) => mockBuilder);

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import {
  findActiveProductByBarcode,
  searchProductsForNegocio,
} from '../negociosProductsService';

const product = {
  id: 'product-1',
  name: 'Nevera',
  sku: 'NEV-1',
  barcode: '770123',
  sale_price: 2_000_000,
};

describe('negociosProductsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockBuilder)) delete mockBuilder[key];
    for (const method of ['select', 'is', 'eq', 'or', 'order']) {
      mockBuilder[method] = jest.fn(() => mockBuilder);
    }
    mockBuilder.limit = jest.fn(async () => ({ data: [product], error: null }));
    mockBuilder.maybeSingle = jest.fn(async () => ({ data: product, error: null }));
  });

  it('busca productos activos por nombre, SKU o código', async () => {
    await expect(searchProductsForNegocio(' nevera ')).resolves.toEqual([product]);
    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockBuilder.or).toHaveBeenCalledWith(
      'name.ilike.%nevera%,sku.ilike.%nevera%,barcode.ilike.%nevera%'
    );
    expect(mockBuilder.eq).toHaveBeenCalledWith('status', true);
  });

  it('resuelve el código exacto únicamente entre productos activos', async () => {
    await expect(findActiveProductByBarcode(' 770123 ')).resolves.toEqual(product);
    expect(mockBuilder.eq).toHaveBeenCalledWith('barcode', '770123');
    expect(mockBuilder.eq).toHaveBeenCalledWith('status', true);
  });

  it('devuelve null si el código no existe', async () => {
    mockBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(findActiveProductByBarcode('999')).resolves.toBeNull();
  });
});
