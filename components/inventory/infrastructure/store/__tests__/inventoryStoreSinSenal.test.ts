import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  fetchActiveWarehousesFromLocal,
  fetchInventoryPageFromLocal,
} from '@/lib/offline/repositories/catalogRepository';
import { SIN_PRODUCTOS_LOCALES, useInventoryStore } from '../inventoryStore';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  fetchInventoryPageFromLocal: jest.fn(),
  fetchActiveWarehousesFromLocal: jest.fn(),
  localCatalogPulledAt: jest.fn(async () => 1_760_000_000_000),
}));

/** Lo que devuelve PostgREST cuando la petición no llega al servidor. */
const NETWORK_ERROR = { message: 'TypeError: Network request failed', details: '', hint: '', code: '' };

const localPage = {
  rows: [
    {
      id: 'p1',
      name: 'Nevera Haceb',
      sku: 'NEV-1',
      barcode: '770001',
      status: true,
      totalStock: 3,
      stock: [{ warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 3 }],
    },
  ],
  totalCount: 1,
};

function resetStore() {
  useInventoryStore.setState({
    inventory: [],
    warehouses: [],
    selectedWarehouseId: null,
    selectedCategoryId: null,
    currentPage: 1,
    pageSize: 20,
    totalCount: 0,
    hasMore: false,
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    fromLocal: false,
    localPulledAt: null,
    searchQuery: '',
  });
}

describe('inventoryStore sin señal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetStore();
    useSyncStore.setState({ online: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('si la petición no llega, muestra los productos descargados en vez del error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: NETWORK_ERROR });
    (fetchInventoryPageFromLocal as jest.Mock).mockResolvedValue(localPage);

    await useInventoryStore.getState().loadInventory({ page: 1 });

    const state = useInventoryStore.getState();
    expect(state.error).toBeNull();
    expect(state.fromLocal).toBe(true);
    expect(state.localPulledAt).toBe(1_760_000_000_000);
    expect(state.inventory).toHaveLength(1);
    expect(state.inventory[0]).toMatchObject({
      id: 'p1',
      name: 'Nevera Haceb',
      total_stock: 3,
      stock_by_warehouse: { w1: { warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 3 } },
    });
  });

  it('con NetInfo sin red va directo al teléfono, sin esperar al servidor', async () => {
    useSyncStore.setState({ online: false });
    (fetchInventoryPageFromLocal as jest.Mock).mockResolvedValue(localPage);
    useInventoryStore.setState({ searchQuery: 'nevera', selectedCategoryId: 'cat-1' });

    await useInventoryStore.getState().loadInventory({ page: 1, warehouseId: 'w1' });

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(fetchInventoryPageFromLocal).toHaveBeenCalledWith({
      search: 'nevera',
      warehouseId: 'w1',
      categoryId: 'cat-1',
      page: 1,
      pageSize: 20,
    });
    expect(useInventoryStore.getState().fromLocal).toBe(true);
  });

  it('sin productos en el teléfono lo dice en llano', async () => {
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error('La red no respondió a tiempo.'));
    (fetchInventoryPageFromLocal as jest.Mock).mockResolvedValue(null);

    await useInventoryStore.getState().loadInventory({ page: 1 });

    expect(useInventoryStore.getState().error).toBe(SIN_PRODUCTOS_LOCALES);
    expect(useInventoryStore.getState().inventory).toEqual([]);
  });

  it('un rechazo del servidor que no es de red no cae a lo local', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'boom', code: 'XX000' } });

    await useInventoryStore.getState().loadInventory({ page: 1 });

    expect(fetchInventoryPageFromLocal).not.toHaveBeenCalled();
    expect(useInventoryStore.getState().fromLocal).toBe(false);
    expect(useInventoryStore.getState().error).toBe('boom');
  });

  it('con señal de nuevo, la lista vuelve a ser del servidor', async () => {
    useInventoryStore.setState({ fromLocal: true });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });

    await useInventoryStore.getState().loadInventory({ page: 1 });

    expect(useInventoryStore.getState().fromLocal).toBe(false);
  });

  it('las bodegas del filtro salen de la descarga si no hay red', async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: NETWORK_ERROR });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ select });
    (fetchActiveWarehousesFromLocal as jest.Mock).mockResolvedValue([
      { id: 'w1', name: 'Principal', city: null },
    ]);

    await useInventoryStore.getState().loadWarehouses();

    expect(useInventoryStore.getState().warehouses).toEqual([{ id: 'w1', name: 'Principal', city: null }]);
  });
});
