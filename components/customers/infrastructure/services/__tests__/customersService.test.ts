import { createCustomer } from '../customersService';

const mockInsert = jest.fn();
const mockCreateCustomerOffline = jest.fn();
const mockIsNetworkError = jest.fn((_error: unknown) => false);
/** Cuando es true, el insert online responde con error de red. */
let mockInsertFails = false;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        mockInsert(payload);
        return {
          select: () => ({
            single: async () =>
              mockInsertFails
                ? { data: null, error: { message: 'Network request failed' } }
                : { data: { id: 'c1', name: 'Ana', id_number: '123' }, error: null },
          }),
        };
      },
    }),
  },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: (error: unknown) => mockIsNetworkError(error),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => true,
  createCustomerOffline: (input: unknown) => mockCreateCustomerOffline(input),
  searchCustomersFromLocal: jest.fn(),
}));

describe('createCustomer', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockCreateCustomerOffline.mockClear();
    mockIsNetworkError.mockReturnValue(false);
    mockInsertFails = false;
  });

  it('guarda la ubicación cuando el vendedor la diligencia', async () => {
    await createCustomer({
      name: 'Ana',
      idNumber: '123',
      phone: null,
      address: 'Carrera 5 # 12-30',
      municipioId: 'm1',
      veredaId: 'v1',
    });

    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Ana',
      id_number: '123',
      phone: null,
      address: 'Carrera 5 # 12-30',
      municipio_id: 'm1',
      vereda_id: 'v1',
    });
  });

  it('deja la ubicación en null cuando se omite: los tres campos son opcionales', async () => {
    await createCustomer({ name: 'Ana', idNumber: '123', phone: '3101234567' });

    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Ana',
      id_number: '123',
      phone: '3101234567',
      address: null,
      municipio_id: null,
      vereda_id: null,
    });
  });

  it('sin red delega en el alta offline conservando la ubicación', async () => {
    mockInsertFails = true;
    mockIsNetworkError.mockReturnValue(true);
    mockCreateCustomerOffline.mockResolvedValue({ id: 'local-1', name: 'Ana', id_number: '123' });

    const input = {
      name: 'Ana',
      idNumber: '123',
      phone: null,
      address: 'Vereda El Cairo, casa 3',
      municipioId: 'm1',
      veredaId: 'v1',
    };
    await expect(createCustomer(input)).resolves.toEqual({
      id: 'local-1',
      name: 'Ana',
      id_number: '123',
    });

    expect(mockCreateCustomerOffline).toHaveBeenCalledWith(input);
  });
});
