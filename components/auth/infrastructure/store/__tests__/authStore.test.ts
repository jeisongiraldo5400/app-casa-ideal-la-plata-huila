import { supabase } from '@/lib/supabase';
import { getLastOnlineVerifiedAt, setLastOnlineVerifiedAt } from '@/lib/offline/security/secureKeys';
import { wipeLocalOfflineData } from '@/lib/offline/security/wipe';
import type { Session, User } from '@supabase/supabase-js';
import { useAuthStore } from '../authStore';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn(),
      getUser: jest.fn(),
      signOut: jest.fn(),
      signInWithPassword: jest.fn(),
      updateUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

jest.mock('@/lib/offline/security/secureKeys', () => ({
  getLastOnlineVerifiedAt: jest.fn(),
  setLastOnlineVerifiedAt: jest.fn(),
}));

jest.mock('@/lib/offline/security/wipe', () => ({
  wipeLocalOfflineData: jest.fn(),
}));

const auth = supabase.auth as unknown as {
  onAuthStateChange: jest.Mock;
  getSession: jest.Mock;
  getUser: jest.Mock;
  signOut: jest.Mock;
};

const mockFrom = supabase.from as jest.Mock;
const mockGetLastOnlineVerifiedAt = getLastOnlineVerifiedAt as jest.Mock;
const mockSetLastOnlineVerifiedAt = setLastOnlineVerifiedAt as jest.Mock;
const mockWipe = wipeLocalOfflineData as jest.Mock;

type AuthChangeHandler = (event: string, session: Session | null) => void;

function createUser(id = 'user-1'): User {
  return { id, email: 'bodega@casaideal.test' } as User;
}

function createSession(user = createUser()): Session {
  return { access_token: 'token', user } as Session;
}

function resetAuthStore() {
  useAuthStore.getState().cleanup();
  useAuthStore.setState({
    session: null,
    user: null,
    loading: true,
    initialized: false,
    offlineSession: false,
  });
}

function mockProfileLookup(result: { data: { id: string } | null; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        is: () => ({ maybeSingle }),
      }),
    }),
  });
  return maybeSingle;
}

describe('authStore.initialize', () => {
  let authChangeHandler: AuthChangeHandler | null;

  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthStore();
    authChangeHandler = null;
    auth.onAuthStateChange.mockImplementation((handler: AuthChangeHandler) => {
      authChangeHandler = handler;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    auth.signOut.mockResolvedValue({ error: null });
    mockGetLastOnlineVerifiedAt.mockResolvedValue(null);
    mockSetLastOnlineVerifiedAt.mockResolvedValue(undefined);
    mockWipe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    useAuthStore.getState().cleanup();
  });

  it('deja session en null cuando no hay sesión persistida', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.initialized).toBe(true);
    expect(state.offlineSession).toBe(false);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('cierra sesión si el token cacheado no es válido', async () => {
    const cached = createSession();
    auth.getSession.mockResolvedValue({ data: { session: cached }, error: null });
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid JWT' },
    });

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(auth.signOut).toHaveBeenCalled();
    expect(state.session).toBeNull();
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.initialized).toBe(true);
    expect(state.offlineSession).toBe(false);
  });

  it('no adelanta session ni loading si el listener dispara durante initialize', async () => {
    const cached = createSession();
    let resolveGetUser: (value: { data: { user: User | null }; error: unknown }) => void = () => undefined;
    const pendingGetUser = new Promise<{ data: { user: User | null }; error: unknown }>((resolve) => {
      resolveGetUser = resolve;
    });

    auth.getSession.mockResolvedValue({ data: { session: cached }, error: null });
    auth.getUser.mockReturnValue(pendingGetUser);

    const initializePromise = useAuthStore.getState().initialize();
    await Promise.resolve();
    await Promise.resolve();

    expect(authChangeHandler).toBeTruthy();
    authChangeHandler?.('SIGNED_IN', cached);

    const midState = useAuthStore.getState();
    expect(midState.session).toBeNull();
    expect(midState.loading).toBe(true);
    expect(midState.initialized).toBe(false);

    resolveGetUser({ data: { user: null }, error: { message: 'Invalid JWT' } });
    await initializePromise;

    const finalState = useAuthStore.getState();
    expect(finalState.session).toBeNull();
    expect(finalState.loading).toBe(false);
    expect(finalState.initialized).toBe(true);
  });

  it('confirma la sesión cuando getUser y el perfil activo son válidos', async () => {
    const user = createUser();
    const session = createSession(user);
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mockProfileLookup({ data: { id: user.id }, error: null });

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.session).toEqual({ ...session, user });
    expect(state.user).toEqual(user);
    expect(state.loading).toBe(false);
    expect(state.initialized).toBe(true);
    expect(state.offlineSession).toBe(false);
    expect(mockSetLastOnlineVerifiedAt).toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
