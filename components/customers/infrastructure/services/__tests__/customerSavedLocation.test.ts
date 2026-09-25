/**
 * Ubicación guardada del cliente para el asistente de negocio. Sin señal debe
 * salir de la base local: antes devolvía `null` y el paso de ubicación se
 * quedaba vacío aunque el cliente ya estuviera descargado.
 */
import { fetchCustomerSavedLocation } from '../customersService';

type RemoteResult = { data: Record<string, unknown> | null; error: { message: string } | null };

const mockFetchCustomerFromLocal = jest.fn();
let mockRemote: RemoteResult | Error = { data: null, error: null };
let mockLocalDb = true;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (mockRemote instanceof Error) throw mockRemote;
            return mockRemote;
          },
        }),
      }),
    }),
  },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: (error: unknown) =>
    /network request failed/i.test(String((error as { message?: string })?.message ?? '')),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => mockLocalDb,
  createCustomerOffline: jest.fn(),
  fetchCustomerFromLocal: (id: string) => mockFetchCustomerFromLocal(id),
  searchCustomersFromLocal: jest.fn(),
}));

const localRow = {
  id: 'c1',
  name: 'Ana',
  idNumber: '123',
  phone: null,
  sellerId: null,
  email: null,
  address: '  Vereda El Cairo, casa 3 ',
  municipioId: 'm1',
  veredaId: 'v1',
};

describe('fetchCustomerSavedLocation', () => {
  beforeEach(() => {
    mockFetchCustomerFromLocal.mockReset();
    mockFetchCustomerFromLocal.mockResolvedValue(localRow);
    mockLocalDb = true;
    mockRemote = { data: null, error: null };
  });

  it('con señal usa la ubicación del servidor y no toca la base local', async () => {
    mockRemote = { data: { municipio_id: 'm9', vereda_id: null, address: 'Calle 1' }, error: null };

    await expect(fetchCustomerSavedLocation('c1')).resolves.toEqual({
      municipioId: 'm9',
      veredaId: null,
      address: 'Calle 1',
    });
    expect(mockFetchCustomerFromLocal).not.toHaveBeenCalled();
  });

  it('sin señal (supabase devuelve error de red) la lee de la base local', async () => {
    mockRemote = { data: null, error: { message: 'TypeError: Network request failed' } };

    await expect(fetchCustomerSavedLocation('c1')).resolves.toEqual({
      municipioId: 'm1',
      veredaId: 'v1',
      address: 'Vereda El Cairo, casa 3',
    });
    expect(mockFetchCustomerFromLocal).toHaveBeenCalledWith('c1');
  });

  it('sin señal (la petición lanza) también la lee de la base local', async () => {
    mockRemote = new Error('Network request failed');

    await expect(fetchCustomerSavedLocation('c1')).resolves.toMatchObject({ municipioId: 'm1' });
  });

  it('cliente creado sin señal: el servidor aún no lo tiene y se usa la copia local', async () => {
    mockRemote = { data: null, error: null };

    await expect(fetchCustomerSavedLocation('c1')).resolves.toMatchObject({ municipioId: 'm1', veredaId: 'v1' });
  });

  it('sin señal y cliente sin ubicación local: campos en null', async () => {
    mockRemote = new Error('Network request failed');
    mockFetchCustomerFromLocal.mockResolvedValue({ ...localRow, address: '  ', municipioId: '', veredaId: null });

    await expect(fetchCustomerSavedLocation('c1')).resolves.toEqual({
      municipioId: null,
      veredaId: null,
      address: null,
    });
  });

  it('sin señal y cliente no descargado: null', async () => {
    mockRemote = new Error('Network request failed');
    mockFetchCustomerFromLocal.mockResolvedValue(null);

    await expect(fetchCustomerSavedLocation('c1')).resolves.toBeNull();
  });

  it('sin señal y sin base local abierta: null sin consultarla', async () => {
    mockRemote = new Error('Network request failed');
    mockLocalDb = false;

    await expect(fetchCustomerSavedLocation('c1')).resolves.toBeNull();
    expect(mockFetchCustomerFromLocal).not.toHaveBeenCalled();
  });

  it('un error que no es de red devuelve null y no consulta la base local', async () => {
    mockRemote = { data: null, error: { message: 'permission denied for table customers' } };

    await expect(fetchCustomerSavedLocation('c1')).resolves.toBeNull();
    expect(mockFetchCustomerFromLocal).not.toHaveBeenCalled();
  });

  it('si la lectura local falla no lanza: devuelve null', async () => {
    mockRemote = new Error('Network request failed');
    mockFetchCustomerFromLocal.mockRejectedValue(new Error('db cerrada'));

    await expect(fetchCustomerSavedLocation('c1')).resolves.toBeNull();
  });
});
