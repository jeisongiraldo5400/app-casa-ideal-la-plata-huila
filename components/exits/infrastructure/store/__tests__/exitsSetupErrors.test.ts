import { useExitsStore } from '../exitsStore';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  },
}));

jest.mock('@/lib/operationLogger', () => ({ logOperationError: jest.fn(async () => undefined) }));

const STALE_ERROR = 'No fue posible verificar las salidas canceladas: Bad Request';

describe('exitsStore · el error de carga no queda pegado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExitsStore.getState().reset();
  });

  it.each([
    ['cambiar de cliente', () => useExitsStore.getState().setSelectedCustomer('customer-2')],
    ['cambiar de usuario', () => useExitsStore.getState().setSelectedUser('user-2')],
    ['cambiar de modo', () => useExitsStore.getState().setExitMode('direct_user')],
  ])('se limpia al %s', (_label, action) => {
    useExitsStore.setState({ error: STALE_ERROR });
    action();
    expect(useExitsStore.getState().error).toBeNull();
  });

  it('se limpia al iniciar una nueva búsqueda de órdenes del usuario', async () => {
    useExitsStore.setState({ error: STALE_ERROR, exitMode: 'direct_user', selectedUserId: 'user-1' });
    let resolveRpc: (value: unknown) => void = () => undefined;
    mockRpc.mockReturnValueOnce(new Promise((resolve) => { resolveRpc = resolve; }));

    const pending = useExitsStore.getState().searchDeliveryOrdersByUser('user-1');
    expect(useExitsStore.getState().error).toBeNull();
    expect(useExitsStore.getState().loading).toBe(true);

    resolveRpc({ data: [], error: null });
    await pending;
    expect(useExitsStore.getState().error).toBeNull();
    expect(useExitsStore.getState().deliveryOrders).toEqual([]);
  });

  it('se limpia al iniciar una nueva búsqueda de órdenes del cliente', async () => {
    useExitsStore.setState({ error: STALE_ERROR, exitMode: 'direct_customer', selectedCustomerId: 'customer-1' });
    const query: Record<string, unknown> = {};
    ['select', 'eq', 'is', 'order'].forEach((method) => { query[method] = () => query; });
    query.limit = () => Promise.resolve({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    const pending = useExitsStore.getState().searchDeliveryOrdersByCustomer('customer-1');
    expect(useExitsStore.getState().error).toBeNull();
    await pending;
    expect(useExitsStore.getState().error).toBeNull();
  });
});
