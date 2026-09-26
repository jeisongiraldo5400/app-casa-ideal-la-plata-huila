import { supabase } from '@/lib/supabase';
import { exitsListSubtitle } from '@/components/exits-list/utils/exitsListSubtitle';
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

describe('exitsListStore · fallos de carga', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    useExitsListStore.setState({ exits: [], loading: false, error: null, searchQuery: '', currentPage: 1, totalCount: 7, hasMore: true });
  });

  afterEach(() => errorSpy.mockRestore());

  it('un error del RPC queda expuesto y traducido, no como lista vacía', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });

    await useExitsListStore.getState().loadExits();

    const state = useExitsListStore.getState();
    expect(state.error).toBe('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
    expect(state.loading).toBe(false);
    // El conteo anterior no puede quedarse: la pantalla diría "7 registros".
    expect(state.totalCount).toBe(0);
    expect(state.hasMore).toBe(false);
  });

  it('una excepción sin red también deja el mensaje en español', async () => {
    mockedRpc.mockRejectedValue(new TypeError('Network request failed'));

    await useExitsListStore.getState().loadExits();

    expect(useExitsListStore.getState().error).toBe(
      'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.'
    );
  });
});

describe('exitsListStore · paginación y búsqueda', () => {
  const page = (ids: string[], total: number) => ({
    data: ids.map((id) => dashboardRow(id, { total_count: total, quantity: 2 })),
    error: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useExitsListStore.setState({
      exits: [], loading: false, loadingMore: false, error: null, loadMoreError: null,
      searchQuery: '', currentPage: 1, pageSize: 2, totalCount: 0, hasMore: false,
    });
  });

  it('«Cargar más» suma la página siguiente a la lista en vez de reemplazarla', async () => {
    mockedRpc.mockImplementation((fn: string, args: { page: number }) => {
      if (fn === 'get_exit_serials') return Promise.resolve({ data: [], error: null });
      return Promise.resolve(args.page === 1 ? page(['a', 'b'], 3) : page(['b', 'c'], 3));
    });

    await useExitsListStore.getState().loadExits();
    expect(useExitsListStore.getState().hasMore).toBe(true);

    await useExitsListStore.getState().loadNextPage();

    const state = useExitsListStore.getState();
    // «b» llegó repetida (entró una salida nueva entre páginas): no se duplica.
    expect(state.exits.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(state.currentPage).toBe(2);
    expect(state.totalCount).toBe(3);
    expect(state.hasMore).toBe(false);
    expect(mockedRpc).toHaveBeenCalledWith('get_inventory_exits_dashboard', { page: 2, page_size: 2, search_term: null });
  });

  it('si falla la página siguiente conserva lo cargado y muestra el error aparte', async () => {
    mockedRpc.mockImplementation((fn: string, args: { page: number }) => {
      if (fn === 'get_exit_serials') return Promise.resolve({ data: [], error: null });
      return args.page === 1
        ? Promise.resolve(page(['a', 'b'], 3))
        : Promise.resolve({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useExitsListStore.getState().loadExits();
    await useExitsListStore.getState().loadNextPage();

    const state = useExitsListStore.getState();
    expect(state.exits).toHaveLength(2);
    expect(state.error).toBeNull();
    expect(state.loadMoreError).toBe('Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
    expect(state.hasMore).toBe(true);
    warnSpy.mockRestore();
  });

  it('buscar recarga desde la primera página y no repite la consulta con el mismo término', async () => {
    mockedRpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'get_exit_serials' ? { data: [], error: null } : page(['a'], 1))
    );
    useExitsListStore.setState({ currentPage: 3 });

    await useExitsListStore.getState().searchExits('nevera');
    await useExitsListStore.getState().searchExits('nevera');

    const dashboardCalls = mockedRpc.mock.calls.filter(([fn]) => fn === 'get_inventory_exits_dashboard');
    expect(dashboardCalls).toEqual([['get_inventory_exits_dashboard', { page: 1, page_size: 2, search_term: 'nevera' }]]);
  });
});

describe('exitsListSubtitle', () => {
  it('muestra el total real y cuántas se ven cuando falta cargar', () => {
    expect(exitsListSubtitle([{ quantity: 1 }, { quantity: 2 }], 120)).toBe('120 registros · mostrando 2');
  });

  it('con todo cargado muestra las unidades', () => {
    expect(exitsListSubtitle([{ quantity: 1 }, { quantity: 2 }], 2)).toBe('2 registros · 3 unidades despachadas');
    expect(exitsListSubtitle([{ quantity: 4 }], 1)).toBe('1 registro · 4 unidades despachadas');
  });
});
