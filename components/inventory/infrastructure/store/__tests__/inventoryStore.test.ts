import { supabase } from '@/lib/supabase';
import { useInventoryStore } from '../inventoryStore';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

function product(id: string, warehouseId = 'warehouse-1') {
  return {
    id,
    name: `Producto ${id}`,
    sku: id,
    barcode: id,
    brand_id: 'brand-1',
    brand_name: 'Marca',
    category_id: 'category-1',
    category_name: 'Categoría',
    color_id: null,
    color_name: null,
    created_at: '2026-08-21T00:00:00Z',
    deleted_at: null,
    sale_price: 100,
    status: true,
    stock_by_warehouse: [
      { warehouseId, warehouseName: 'Bodega', quantity: 2 },
    ],
    total_count: 2,
    total_stock: 2,
  };
}

describe('inventoryStore pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useInventoryStore.setState({
      inventory: [],
      selectedWarehouseId: null,
      currentPage: 1,
      pageSize: 1,
      totalCount: 0,
      hasMore: false,
      loading: false,
      error: null,
      searchQuery: '',
    });
  });

  it('acumula la siguiente página en lugar de reemplazarla', async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: [product('p1')], error: null })
      .mockResolvedValueOnce({ data: [product('p2')], error: null });

    await useInventoryStore.getState().loadInventory();
    await useInventoryStore.getState().loadNextPage();

    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['p1', 'p2']);
  });

  it('permite seguir paginando si una página no contiene la bodega seleccionada', async () => {
    useInventoryStore.setState({ selectedWarehouseId: 'warehouse-target' });
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: [{ ...product('p1', 'another-warehouse'), total_count: 2 }],
      error: null,
    });

    await useInventoryStore.getState().loadInventory();

    expect(useInventoryStore.getState().inventory).toEqual([]);
    expect(useInventoryStore.getState().hasMore).toBe(true);
  });
});
