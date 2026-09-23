import { act, renderHook, waitFor } from '@testing-library/react-native';
import { supabase } from '@/lib/supabase';
import { getCachedRoles } from '@/lib/offline/security/secureKeys';
import { useUserRolesStore } from '@/lib/auth/userRolesStore';
import { useUserRoles } from '../useUserRoles';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));
jest.mock('@/lib/offline/security/secureKeys', () => ({
  getCachedRoles: jest.fn(async () => null),
  setCachedRoles: jest.fn(async () => undefined),
}));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({ isNetworkError: jest.fn(() => false) }));
jest.mock('@/lib/errorMessage', () => ({ logHandledError: jest.fn() }));

let mockUser: { id: string } | null = { id: 'u1' };
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const row = (nombre: string, suffix = '1') => ({
  id: `ur-${suffix}`,
  role_id: `r-${suffix}`,
  role: { id: `r-${suffix}`, nombre, deleted_at: null },
});

const select = jest.fn();
const eq = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1' };
  eq.mockResolvedValue({ data: [], error: null });
  select.mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  (supabase.channel as jest.Mock).mockReturnValue({
    on: jest.fn().mockReturnValue({ subscribe: jest.fn().mockReturnValue({}) }),
  });
  (getCachedRoles as jest.Mock).mockResolvedValue(null);
  useUserRolesStore.getState().reset();
});

describe('useUserRoles', () => {
  it('los ayudantes de rol siguen respondiendo igual', async () => {
    eq.mockResolvedValue({ data: [row('Admin')], error: null });

    const { result } = renderHook(() => useUserRoles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin()).toBe(true);
    expect(result.current.isBodeguero()).toBe(false);
    expect(result.current.isVendedor()).toBe(false);
    expect(result.current.isGestorCobro()).toBe(false);
    expect(result.current.isRecaudador()).toBe(false);
    // `admin` también abre el módulo de catálogos.
    expect(result.current.canAccessCatalogs()).toBe(true);
    expect(result.current.canMarkOrderAsReceived()).toBe(true);
    // Admin ve los dos mundos: no se fuerza el modo vendedor.
    expect(result.current.preferSellerWorkspace()).toBe(false);
    expect(result.current.hasRole('admin')).toBe(true);
    expect(result.current.roles).toEqual([
      { id: 'ur-1', role_id: 'r-1', role: { id: 'r-1', nombre: 'Admin' } },
    ]);
  });

  it('reconoce gestor de cobro, recaudador y el modo vendedor', async () => {
    eq.mockResolvedValue({
      data: [row('gestor de cobro'), row('recaudador', '2'), row('vendedor', '3')],
      error: null,
    });

    const { result } = renderHook(() => useUserRoles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isGestorCobro()).toBe(true);
    expect(result.current.isRecaudador()).toBe(true);
    expect(result.current.isVendedor()).toBe(true);
    expect(result.current.isAdmin()).toBe(false);
    expect(result.current.preferSellerWorkspace()).toBe(true);
    expect(result.current.canAccessCatalogs()).toBe(false);
    expect(result.current.canMarkOrderAsReceived()).toBe(false);
  });

  it('dos consumidores comparten una sola consulta y el mismo resultado', async () => {
    eq.mockResolvedValue({ data: [row('vendedor')], error: null });

    const first = renderHook(() => useUserRoles());
    const second = renderHook(() => useUserRoles());

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    expect(first.result.current.isVendedor()).toBe(true);
    expect(second.result.current.isVendedor()).toBe(true);
    // Mismo objeto: no hay una copia por pantalla.
    expect(first.result.current.roles).toBe(second.result.current.roles);
  });

  it('pinta la caché antes de que conteste la red', async () => {
    (getCachedRoles as jest.Mock).mockResolvedValue({
      userId: 'u1',
      roles: [{ id: 'ur-1', role_id: 'r-1', role: { id: 'r-1', nombre: 'gestor de cobro' } }],
    });
    let settle!: (value: unknown) => void;
    eq.mockReturnValue(new Promise((resolve) => (settle = resolve)));

    const { result } = renderHook(() => useUserRoles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isGestorCobro()).toBe(true);

    await act(async () => {
      settle({ data: [row('admin')], error: null });
    });

    expect(result.current.isAdmin()).toBe(true);
    expect(result.current.isGestorCobro()).toBe(false);
  });

  it('mientras no se sabe el rol, ningún ayudante concede acceso', async () => {
    let settle!: (value: unknown) => void;
    eq.mockReturnValue(new Promise((resolve) => (settle = resolve)));

    const { result } = renderHook(() => useUserRoles());

    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin()).toBe(false);
    expect(result.current.isGestorCobro()).toBe(false);
    expect(result.current.canAccessCatalogs()).toBe(false);
    expect(result.current.canMarkOrderAsReceived()).toBe(false);
    expect(result.current.roles).toEqual([]);

    await act(async () => {
      settle({ data: [], error: null });
    });
  });

  it('sin sesión no consulta y deja de esperar', async () => {
    mockUser = null;

    const { result } = renderHook(() => useUserRoles());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.roles).toEqual([]);
  });

  it('los ayudantes conservan su identidad entre renders (sirven de dependencia)', async () => {
    eq.mockResolvedValue({ data: [row('vendedor')], error: null });

    const { result, rerender } = renderHook(() => useUserRoles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = result.current.preferSellerWorkspace;
    rerender({});

    expect(result.current.preferSellerWorkspace).toBe(before);
  });

  it('el último consumidor en desmontarse cierra el canal de realtime', async () => {
    eq.mockResolvedValue({ data: [row('admin')], error: null });

    const first = renderHook(() => useUserRoles());
    const second = renderHook(() => useUserRoles());
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    first.unmount();
    expect(supabase.removeChannel).not.toHaveBeenCalled();

    second.unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });
});
