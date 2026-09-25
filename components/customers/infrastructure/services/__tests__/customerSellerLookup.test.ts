import { customerSellerLabel, fetchCustomerSellerLookup } from '../customerSellerLookup';

type Response = { data: unknown; error: unknown };
let mockResponse: Response = { data: null, error: null };
const mockIsNetworkError = jest.fn((_error: unknown) => false);
const mockFetchCustomerFromLocal = jest.fn();
const mockFetchProfileNamesFromLocal = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => mockResponse }),
      }),
    }),
  },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: (error: unknown) => mockIsNetworkError(error),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => true,
  fetchCustomerFromLocal: (id: string) => mockFetchCustomerFromLocal(id),
  fetchProfileNamesFromLocal: () => mockFetchProfileNamesFromLocal(),
}));

describe('fetchCustomerSellerLookup', () => {
  beforeEach(() => {
    mockIsNetworkError.mockReturnValue(false);
    mockFetchCustomerFromLocal.mockReset();
    mockFetchProfileNamesFromLocal.mockReset();
  });

  it('con señal trae el nombre del vendedor del cliente', async () => {
    mockResponse = { data: { seller_id: 's1', seller: { full_name: 'Luis', email: null } }, error: null };
    await expect(fetchCustomerSellerLookup('c1')).resolves.toEqual({
      status: 'assigned',
      sellerId: 's1',
      name: 'Luis',
    });
  });

  it('cliente sin vendedor', async () => {
    mockResponse = { data: { seller_id: null, seller: null }, error: null };
    await expect(fetchCustomerSellerLookup('c1')).resolves.toEqual({ status: 'unassigned' });
  });

  it('sin señal usa el cliente y los perfiles descargados', async () => {
    mockResponse = { data: null, error: { message: 'Network request failed' } };
    mockIsNetworkError.mockReturnValue(true);
    mockFetchCustomerFromLocal.mockResolvedValue({ id: 'c1', sellerId: 's1' });
    mockFetchProfileNamesFromLocal.mockResolvedValue(new Map([['s1', 'Luis']]));
    await expect(fetchCustomerSellerLookup('c1')).resolves.toEqual({
      status: 'assigned',
      sellerId: 's1',
      name: 'Luis',
    });
  });

  it('sin señal y sin el cliente en el teléfono no afirma nada', async () => {
    mockResponse = { data: null, error: { message: 'Network request failed' } };
    mockIsNetworkError.mockReturnValue(true);
    mockFetchCustomerFromLocal.mockResolvedValue(null);
    mockFetchProfileNamesFromLocal.mockResolvedValue(new Map());
    await expect(fetchCustomerSellerLookup('c1')).resolves.toEqual({ status: 'unknown' });
  });

  it('un error que no es de red no rompe el asistente', async () => {
    mockResponse = { data: null, error: { message: 'permiso denegado' } };
    await expect(fetchCustomerSellerLookup('c1')).resolves.toEqual({ status: 'unknown' });
  });
});

describe('customerSellerLabel', () => {
  it('traduce cada estado', () => {
    expect(customerSellerLabel(null)).toBe('Cargando…');
    expect(customerSellerLabel({ status: 'unassigned' })).toBe('Sin asignar');
    expect(customerSellerLabel({ status: 'unknown' })).toBe('No disponible');
    expect(customerSellerLabel({ status: 'assigned', sellerId: 's1', name: 'Luis' })).toBe('Luis');
    expect(customerSellerLabel({ status: 'assigned', sellerId: 's1', name: null })).toBe(
      'Asignado (nombre no disponible sin señal)'
    );
  });
});
