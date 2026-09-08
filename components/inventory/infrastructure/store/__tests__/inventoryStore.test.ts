import { supabase } from '@/lib/supabase';
import { useInventoryStore } from '../inventoryStore';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

function product(id: string, totalCount = 2, warehouseId = 'warehouse-1') {
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
    total_count: totalCount,
    total_stock: 2,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('inventoryStore pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useInventoryStore.setState({
      inventory: [],
      selectedWarehouseId: null,
      currentPage: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
      loading: false,
      refreshing: false,
      loadingMore: false,
      error: null,
      searchQuery: '',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('carga inicialmente 20 productos y calcula si existe otra página', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [product('p1', 21)],
      error: null,
    });

    await useInventoryStore.getState().loadInventory({ page: 1 });

    expect(supabase.rpc).toHaveBeenCalledWith('get_products_dashboard', {
      page: 1,
      page_size: 20,
      search_term: null,
      include_deleted: false,
    });
    expect(useInventoryStore.getState()).toMatchObject({
      currentPage: 1,
      totalCount: 21,
      hasMore: true,
    });
  });

  it('acumula la siguiente página y elimina productos duplicados', async () => {
    useInventoryStore.setState({ pageSize: 1 });
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: [product('p1', 3)], error: null })
      .mockResolvedValueOnce({ data: [product('p1', 3), product('p2', 3)], error: null });

    await useInventoryStore.getState().loadInventory({ page: 1 });
    await useInventoryStore.getState().loadNextPage();

    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(useInventoryStore.getState().currentPage).toBe(2);
  });

  it('ignora llamadas repetidas mientras carga la siguiente página', async () => {
    const nextPage = deferred<{ data: ReturnType<typeof product>[]; error: null }>();
    useInventoryStore.setState({
      inventory: [{
        id: 'p1',
        name: 'Producto p1',
        sku: 'p1',
        barcode: 'p1',
        brand_name: 'Marca',
        category_name: 'Categoría',
        color_name: null,
        total_stock: 2,
        stock_by_warehouse: {},
        status: true,
        created_at: '2026-08-21T00:00:00Z',
      }],
      currentPage: 1,
      pageSize: 1,
      totalCount: 2,
      hasMore: true,
    });
    (supabase.rpc as jest.Mock).mockReturnValueOnce(nextPage.promise);

    const firstCall = useInventoryStore.getState().loadNextPage();
    const repeatedCall = useInventoryStore.getState().loadNextPage();

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(useInventoryStore.getState().loadingMore).toBe(true);
    nextPage.resolve({ data: [product('p2', 2)], error: null });
    await Promise.all([firstCall, repeatedCall]);

    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['p1', 'p2']);
  });

  it('envía la bodega al servidor antes de paginar', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [product('p1', 1, 'warehouse-target')],
      error: null,
    });

    await useInventoryStore.getState().loadInventory({
      page: 1,
      warehouseId: 'warehouse-target',
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'get_products_dashboard',
      expect.objectContaining({ p_warehouse_id: 'warehouse-target' })
    );
    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['p1']);
    expect(useInventoryStore.getState().totalCount).toBe(1);
  });

  it('descarta una respuesta anterior cuando cambia la búsqueda', async () => {
    const oldRequest = deferred<{ data: ReturnType<typeof product>[]; error: null }>();
    (supabase.rpc as jest.Mock)
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ data: [product('new', 1)], error: null });

    const pendingOldRequest = useInventoryStore.getState().loadInventory({ page: 1 });
    useInventoryStore.getState().setSearchQuery('mesa');
    await useInventoryStore.getState().loadInventory({ page: 1 });
    oldRequest.resolve({ data: [product('old', 1)], error: null });
    await pendingOldRequest;

    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['new']);
  });

  it('conserva los productos y la página si falla una carga incremental', async () => {
    useInventoryStore.setState({
      inventory: [{
        id: 'p1', name: 'Producto', sku: 'p1', barcode: 'p1', brand_name: 'Marca',
        category_name: 'Categoría', color_name: null, total_stock: 2,
        stock_by_warehouse: {}, status: true, created_at: '2026-08-21T00:00:00Z',
      }],
      currentPage: 1,
      pageSize: 1,
      totalCount: 2,
      hasMore: true,
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Sin conexión' },
    });

    await useInventoryStore.getState().loadNextPage();

    expect(useInventoryStore.getState()).toMatchObject({
      currentPage: 1,
      hasMore: true,
      error: 'Sin conexión',
    });
    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['p1']);
  });

  it('reemplaza los resultados desde la primera página al refrescar', async () => {
    useInventoryStore.setState({
      inventory: [{
        id: 'old', name: 'Anterior', sku: 'old', barcode: 'old', brand_name: 'Marca',
        category_name: 'Categoría', color_name: null, total_stock: 2,
        stock_by_warehouse: {}, status: true, created_at: '2026-08-21T00:00:00Z',
      }],
      currentPage: 2,
    });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [product('fresh', 1)], error: null });

    await useInventoryStore.getState().refreshInventory();

    expect(useInventoryStore.getState().inventory.map((item) => item.id)).toEqual(['fresh']);
    expect(useInventoryStore.getState()).toMatchObject({ currentPage: 1, refreshing: false });
  });
});
