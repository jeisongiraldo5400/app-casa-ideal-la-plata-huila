import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getCachedRoles, setCachedRoles } from '@/lib/offline/security/secureKeys';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  retainUserRolesWatchers,
  useUserRolesStore,
  type UserRole,
} from '../userRolesStore';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));
jest.mock('@/lib/offline/security/secureKeys', () => ({
  getCachedRoles: jest.fn(async () => null),
  setCachedRoles: jest.fn(async () => undefined),
}));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({ isNetworkError: jest.fn(() => false) }));
jest.mock('@/lib/errorMessage', () => ({ logHandledError: jest.fn() }));

const role = (nombre: string, suffix = '1'): UserRole => ({
  id: `ur-${suffix}`,
  role_id: `r-${suffix}`,
  role: { id: `r-${suffix}`, nombre },
});

/** Fila cruda tal como la devuelve PostgREST con el rol embebido. */
const row = (nombre: string, suffix = '1', deletedAt: string | null = null) => ({
  id: `ur-${suffix}`,
  role_id: `r-${suffix}`,
  role: { id: `r-${suffix}`, nombre, deleted_at: deletedAt },
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

const select = jest.fn();
const eq = jest.fn();
const channelOn = jest.fn();
const channelSubscribe = jest.fn();
let appStateHandler: ((state: string) => void) | undefined;
let realtimeHandler: (() => void) | undefined;

/** Deja la consulta colgada hasta que la prueba la resuelva a mano. */
function deferNetwork() {
  let settle!: (value: { data: unknown; error: unknown }) => void;
  eq.mockReturnValue(new Promise((resolve) => (settle = resolve)));
  return settle;
}

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = undefined;
  realtimeHandler = undefined;

  eq.mockResolvedValue({ data: [], error: null });
  select.mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });

  channelSubscribe.mockReturnValue({ topic: 'user-roles' });
  channelOn.mockImplementation((_event, _filter, callback) => {
    realtimeHandler = callback;
    return { subscribe: channelSubscribe };
  });
  (supabase.channel as jest.Mock).mockReturnValue({ on: channelOn });

  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (state: string) => void
  ) => {
    appStateHandler = handler;
    return { remove: jest.fn() };
  }) as never);

  (getCachedRoles as jest.Mock).mockResolvedValue(null);
  useUserRolesStore.getState().reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('userRolesStore', () => {
  it('lee los roles con UNA sola consulta y el rol embebido', async () => {
    eq.mockResolvedValue({ data: [row('admin')], error: null });

    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('user_roles');
    expect(select).toHaveBeenCalledWith('id, role_id, role:roles(id, nombre, deleted_at)');
    expect(eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(useUserRolesStore.getState().roles).toEqual([role('admin')]);
    expect(useUserRolesStore.getState().loading).toBe(false);
  });

  it('acepta el rol embebido como lista (cardinalidad inferida por PostgREST)', async () => {
    eq.mockResolvedValue({
      data: [{ id: 'ur-1', role_id: 'r-1', role: [{ id: 'r-1', nombre: 'vendedor', deleted_at: null }] }],
      error: null,
    });

    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(useUserRolesStore.getState().roles[0].role?.nombre).toBe('vendedor');
  });

  it('descarta los roles borrados sin perder la fila', async () => {
    eq.mockResolvedValue({ data: [row('admin', '1', '2026-01-01')], error: null });

    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(useUserRolesStore.getState().roles).toEqual([
      { id: 'ur-1', role_id: 'r-1', role: null },
    ]);
  });

  it('no repite la consulta si varios consumidores declaran el mismo usuario', async () => {
    eq.mockResolvedValue({ data: [row('admin')], error: null });

    useUserRolesStore.getState().setUser('u1');
    useUserRolesStore.getState().setUser('u1');
    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('pinta primero la caché y no espera a la red', async () => {
    (getCachedRoles as jest.Mock).mockResolvedValue({ userId: 'u1', roles: [role('admin')] });
    const settle = deferNetwork();

    useUserRolesStore.getState().setUser('u1');
    await flush();

    // La red sigue en vuelo y la pantalla ya sabe el rol.
    expect(useUserRolesStore.getState().loading).toBe(false);
    expect(useUserRolesStore.getState().roles).toEqual([role('admin')]);
    expect(useUserRolesStore.getState().source).toBe('cache');

    settle({ data: [row('vendedor', '2')], error: null });
    await flush();

    expect(useUserRolesStore.getState().roles).toEqual([role('vendedor', '2')]);
    expect(useUserRolesStore.getState().source).toBe('network');
    expect(setCachedRoles).toHaveBeenCalledWith({ userId: 'u1', roles: [role('vendedor', '2')] });
  });

  it('la caché lenta no pisa el resultado de la red', async () => {
    let releaseCache!: (value: unknown) => void;
    (getCachedRoles as jest.Mock).mockReturnValue(
      new Promise((resolve) => (releaseCache = resolve))
    );
    eq.mockResolvedValue({ data: [row('vendedor', '2')], error: null });

    useUserRolesStore.getState().setUser('u1');
    await flush();
    expect(useUserRolesStore.getState().roles).toEqual([role('vendedor', '2')]);

    releaseCache({ userId: 'u1', roles: [role('admin')] });
    await flush();

    expect(useUserRolesStore.getState().roles).toEqual([role('vendedor', '2')]);
  });

  it('sin red usa los roles cacheados y deja de esperar', async () => {
    (isNetworkError as jest.Mock).mockReturnValue(true);
    (getCachedRoles as jest.Mock).mockResolvedValue({ userId: 'u1', roles: [role('admin')] });
    eq.mockResolvedValue({ data: null, error: new Error('Network request failed') });

    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(useUserRolesStore.getState().roles).toEqual([role('admin')]);
    expect(useUserRolesStore.getState().loading).toBe(false);
  });

  it('ante un error real del servidor y sin caché se queda sin roles', async () => {
    (isNetworkError as jest.Mock).mockReturnValue(false);
    (getCachedRoles as jest.Mock).mockResolvedValue(null);
    eq.mockResolvedValue({ data: null, error: new Error('permission denied') });

    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(useUserRolesStore.getState().roles).toEqual([]);
    expect(useUserRolesStore.getState().loading).toBe(false);
  });

  it('lee la caché una sola vez aunque también sirva de respaldo del error', async () => {
    (isNetworkError as jest.Mock).mockReturnValue(true);
    (getCachedRoles as jest.Mock).mockResolvedValue({ userId: 'u1', roles: [role('admin')] });
    eq.mockResolvedValue({ data: null, error: new Error('Network request failed') });

    useUserRolesStore.getState().setUser('u1');
    await flush();

    expect(getCachedRoles).toHaveBeenCalledTimes(1);
  });

  it('cerrar sesión limpia los roles sin dejar carga colgada', async () => {
    eq.mockResolvedValue({ data: [row('admin')], error: null });
    useUserRolesStore.getState().setUser('u1');
    await flush();

    useUserRolesStore.getState().setUser(null);

    expect(useUserRolesStore.getState().roles).toEqual([]);
    expect(useUserRolesStore.getState().loading).toBe(false);
  });

  it('la respuesta del usuario anterior no se aplica tras cambiar de usuario', async () => {
    const settle = deferNetwork();
    useUserRolesStore.getState().setUser('u1');

    eq.mockResolvedValue({ data: [row('vendedor', '2')], error: null });
    useUserRolesStore.getState().setUser('u2');
    settle({ data: [row('admin')], error: null });
    await flush();

    expect(useUserRolesStore.getState().userId).toBe('u2');
    expect(useUserRolesStore.getState().roles).toEqual([role('vendedor', '2')]);
  });

  it('mantiene la identidad de `roles` cuando el refresco trae lo mismo', async () => {
    eq.mockResolvedValue({ data: [row('admin')], error: null });
    useUserRolesStore.getState().setUser('u1');
    await flush();

    const before = useUserRolesStore.getState().roles;
    await useUserRolesStore.getState().refresh();
    await flush();

    expect(useUserRolesStore.getState().roles).toBe(before);
  });

  describe('suscripciones compartidas', () => {
    it('monta AppState y realtime una sola vez para varios consumidores', async () => {
      useUserRolesStore.getState().setUser('u1');
      const releaseA = retainUserRolesWatchers();
      const releaseB = retainUserRolesWatchers();
      await flush();

      expect(supabase.channel).toHaveBeenCalledTimes(1);
      expect(supabase.channel).toHaveBeenCalledWith('user-roles-u1');
      expect(AppState.addEventListener).toHaveBeenCalledTimes(1);

      releaseA();
      expect(supabase.removeChannel).not.toHaveBeenCalled();
      releaseB();
      expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('vuelve a leer al volver a primer plano y ante cambios de realtime, sin duplicar', async () => {
      useUserRolesStore.getState().setUser('u1');
      const release = retainUserRolesWatchers();
      await flush();
      expect(supabase.from).toHaveBeenCalledTimes(1);

      const settle = deferNetwork();
      appStateHandler?.('active');
      realtimeHandler?.();
      await flush();

      // Los dos disparos simultáneos comparten la misma consulta en vuelo.
      expect(supabase.from).toHaveBeenCalledTimes(2);

      settle({ data: [row('admin')], error: null });
      await flush();
      expect(useUserRolesStore.getState().roles).toEqual([role('admin')]);
      release();
    });

    it('no relee al pasar a segundo plano', async () => {
      useUserRolesStore.getState().setUser('u1');
      const release = retainUserRolesWatchers();
      await flush();

      appStateHandler?.('background');
      await flush();

      expect(supabase.from).toHaveBeenCalledTimes(1);
      release();
    });
  });
});
