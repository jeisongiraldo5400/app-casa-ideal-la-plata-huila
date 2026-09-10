import { supabase } from '@/lib/supabase';
import { useExitsListStore } from '../exitsListStore';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockedRpc = supabase.rpc as jest.Mock;

function dashboardRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    product_id: `product-${id}`,
    product_name: 'Nevera',
    product_sku: 'NEV-1',
    product_barcode: '770123',
    warehouse_id: 'warehouse-1',
    warehouse_name: 'Principal',
    quantity: 1,
    created_at: '2026-09-10T15:00:00Z',
    created_by: 'user-1',
    created_by_name: 'Bodeguero',
    barcode_scanned: '770123',
    is_cancelled: false,
    cancellation_id: null,
    cancellation_observations: null,
    cancellation_created_at: null,
    total_count: 2,
    ...overrides,
  };
}

function serialRow(exitId: string, serial: string, releasedReason: string | null = null) {
  return {
    inventory_exit_id: exitId,
    product_id: `product-${exitId}`,
    serial_number: serial,
    capture_method: 'scan',
    released_reason: releasedReason,
    released_at: releasedReason ? '2026-09-10T16:00:00Z' : null,
    created_at: '2026-09-10T15:00:00Z',
  };
}

/** Responde el tablero de salidas y, por separado, la consulta de seriales. */
function mockRpc({ serials }: { serials: () => Promise<unknown> }) {
  mockedRpc.mockImplementation((fn: string) => {
    if (fn === 'get_inventory_exits_dashboard') {
      return Promise.resolve({ data: [dashboardRow('exit-1'), dashboardRow('exit-2')], error: null });
    }
    if (fn === 'get_exit_serials') return serials();
    throw new Error(`RPC inesperado: ${fn}`);
  });
}

describe('exitsListStore · seriales', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    useExitsListStore.setState({ exits: [], loading: false, error: null, searchQuery: '', currentPage: 1 });
  });

  afterEach(() => warnSpy.mockRestore());

  it('carga los seriales de las salidas visibles con una consulta aparte por ids', async () => {
    mockRpc({
      serials: () => Promise.resolve({
        data: [serialRow('exit-1', 'ab-123'), serialRow('exit-1', 'CD456', 'exit_cancelled')],
        error: null,
      }),
    });

    await useExitsListStore.getState().loadExits();

    expect(mockedRpc).toHaveBeenCalledWith('get_exit_serials', { p_exit_ids: ['exit-1', 'exit-2'] });
    const [first, second] = useExitsListStore.getState().exits;
    expect(first.serials).toEqual([
      { inventoryExitId: 'exit-1', productId: 'product-exit-1', serial: 'ab-123', normalized: 'AB123', method: 'scan', releasedReason: null },
      { inventoryExitId: 'exit-1', productId: 'product-exit-1', serial: 'CD456', normalized: 'CD456', method: 'scan', releasedReason: 'exit_cancelled' },
    ]);
    expect(second.serials).toEqual([]);
    expect(useExitsListStore.getState().error).toBeNull();
  });

  it('si el RPC de seriales responde error, el historial se ve igual y sin seriales', async () => {
    mockRpc({
      serials: () => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.get_exit_serials' },
      }),
    });

    await useExitsListStore.getState().loadExits();

    const state = useExitsListStore.getState();
    expect(state.exits.map((exit) => exit.id)).toEqual(['exit-1', 'exit-2']);
    expect(state.exits.every((exit) => exit.serials.length === 0)).toBe(true);
    expect(state.error).toBeNull();
    expect(state.totalCount).toBe(2);
  });

  it('si la consulta de seriales lanza (sin red), no afecta la lista', async () => {
    mockRpc({ serials: () => Promise.reject(new Error('Network request failed')) });

    await useExitsListStore.getState().loadExits();

    const state = useExitsListStore.getState();
    expect(state.exits).toHaveLength(2);
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('envía el término de búsqueda al servidor, que también busca por serial', async () => {
    mockRpc({ serials: () => Promise.resolve({ data: [], error: null }) });
    useExitsListStore.getState().setSearchQuery('ab-123');

    await useExitsListStore.getState().loadExits();

    expect(mockedRpc).toHaveBeenCalledWith('get_inventory_exits_dashboard', {
      page: 1,
      page_size: 50,
      search_term: 'ab-123',
    });
  });
});
