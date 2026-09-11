import { checkExitAuthorization, UNAUTHORIZED_EXIT_MESSAGE } from '../exitAuthorization';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockLogHandledError = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('@/lib/errorMessage', () => ({
  ...jest.requireActual('@/lib/errorMessage'),
  logHandledError: (...args: unknown[]) => mockLogHandledError(...args),
}));

type Result = { data: unknown; error: unknown };

function chain(result: Result) {
  const obj: Record<string, unknown> = {};
  ['select', 'eq', 'is', 'in'].forEach((method) => {
    obj[method] = jest.fn(() => obj);
  });
  obj.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

function mockTables(tables: {
  assignments?: Result;
  userRoles?: Result;
  roles?: Result;
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'delivery_order_pickup_assignments') {
      return chain(tables.assignments ?? { data: [], error: null });
    }
    if (table === 'user_roles') return chain(tables.userRoles ?? { data: [], error: null });
    if (table === 'roles') return chain(tables.roles ?? { data: [], error: null });
    throw new Error(`tabla inesperada ${table}`);
  });
}

const ALLOWED = { canRegister: true, message: null };
const DENIED = { canRegister: false, message: UNAUTHORIZED_EXIT_MESSAGE };

describe('checkExitAuthorization', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockLogHandledError.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('sin usuario autenticado deniega', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(DENIED);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it.each(['bodeguero', 'Admin'])('el rol %s puede registrar aunque la orden no tenga asignaciones', async (nombre) => {
    mockTables({
      userRoles: { data: [{ role_id: 'r1' }], error: null },
      roles: { data: [{ nombre }], error: null },
    });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(ALLOWED);
  });

  it('un usuario asignado a la orden puede registrar', async () => {
    mockTables({
      assignments: { data: [{ user_id: 'user-2' }, { user_id: 'user-1' }], error: null },
      userRoles: { data: [{ role_id: 'r1' }], error: null },
      roles: { data: [{ nombre: 'vendedor' }], error: null },
    });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(ALLOWED);
  });

  it('si la orden tiene asignaciones de otros usuarios deniega', async () => {
    mockTables({ assignments: { data: [{ user_id: 'user-2' }], error: null } });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(DENIED);
  });

  it('sin rol privilegiado y sin asignaciones deniega', async () => {
    mockTables({
      userRoles: { data: [{ role_id: 'r1' }], error: null },
      roles: { data: [{ nombre: 'vendedor' }], error: null },
    });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(DENIED);
  });

  it('sin red deniega por prudencia y lo registra como error manejado', async () => {
    mockTables({ assignments: { data: null, error: { message: 'Network request failed' } } });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(DENIED);
    expect(mockLogHandledError).toHaveBeenCalledTimes(1);
  });

  it('si falla la lectura de roles deniega aunque el usuario esté asignado', async () => {
    mockTables({
      assignments: { data: [{ user_id: 'user-1' }], error: null },
      userRoles: { data: [{ role_id: 'r1' }], error: null },
      roles: { data: null, error: { message: 'boom' } },
    });

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(DENIED);
  });

  it('una excepción inesperada deniega en vez de romper la pantalla', async () => {
    mockGetUser.mockRejectedValue(new Error('explota'));

    await expect(checkExitAuthorization('order-1')).resolves.toEqual(DENIED);
    expect(mockLogHandledError).toHaveBeenCalled();
  });
});
