import { createCustomer } from '../customersService';

const mockInsert = jest.fn();
const mockSelect = jest.fn();
const mockCreateCustomerOffline = jest.fn();
const mockIsNetworkError = jest.fn((_error: unknown) => false);
/** Cuando es true, el insert online responde con error de red. */
let mockInsertFails = false;
/** `seller_id` que devuelve el servidor tras el trigger `enforce_customer_seller`. */
let mockServerSellerId: string | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        mockInsert(payload);
        return {
          select: (columns: string) => {
            mockSelect(columns);
            return {
              single: async () =>
                mockInsertFails
                  ? { data: null, error: { message: 'Network request failed' } }
                  : {
                      data: { id: 'c1', name: 'Ana', id_number: '123', seller_id: mockServerSellerId },
                      error: null,
                    },
            };
          },
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
    mockSelect.mockClear();
    mockCreateCustomerOffline.mockClear();
    mockIsNetworkError.mockReturnValue(false);
    mockInsertFails = false;
    mockServerSellerId = null;
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

  it('nunca envía seller_id: lo decide el trigger, aunque llegue un vendedor previsto', async () => {
    await createCustomer({ name: 'Ana', idNumber: '123', phone: null, expectedSellerId: 'u1' });

    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('seller_id');
    expect(payload).not.toHaveProperty('expectedSellerId');
  });

  it('solo vendedor con red: devuelve el vendedor que asignó el servidor', async () => {
    mockServerSellerId = 'u1';

    await expect(
      createCustomer({ name: 'Ana', idNumber: '123', phone: null, expectedSellerId: 'u1' })
    ).resolves.toEqual({ id: 'c1', name: 'Ana', id_number: '123', seller_id: 'u1', saved_offline: false });
    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('seller_id'));
  });

  it('admin (o admin + vendedor) con red: el servidor no asigna y se devuelve seller_id null', async () => {
    mockServerSellerId = null;

    await expect(
      createCustomer({ name: 'Ana', idNumber: '123', phone: null, expectedSellerId: null })
    ).resolves.toEqual({ id: 'c1', name: 'Ana', id_number: '123', seller_id: null, saved_offline: false });
  });

  it('sin red, solo vendedor: el reflejo local queda asignado al vendedor previsto', async () => {
    mockInsertFails = true;
    mockIsNetworkError.mockReturnValue(true);
    mockCreateCustomerOffline.mockResolvedValue({ id: 'local-1', name: 'Ana', id_number: '123' });

    const location = {
      name: 'Ana',
      idNumber: '123',
      phone: null,
      address: 'Vereda El Cairo, casa 3',
      municipioId: 'm1',
      veredaId: 'v1',
    };
    await expect(createCustomer({ ...location, expectedSellerId: 'u1' })).resolves.toEqual({
      id: 'local-1',
      name: 'Ana',
      id_number: '123',
      seller_id: 'u1',
      saved_offline: true,
    });

    expect(mockCreateCustomerOffline).toHaveBeenCalledWith({ ...location, sellerId: 'u1' });
  });

  it('sin red, admin: el reflejo local queda sin vendedor', async () => {
    mockInsertFails = true;
    mockIsNetworkError.mockReturnValue(true);
    mockCreateCustomerOffline.mockResolvedValue({ id: 'local-1', name: 'Ana', id_number: '123' });

    await expect(
      createCustomer({ name: 'Ana', idNumber: '123', phone: null, expectedSellerId: null })
    ).resolves.toMatchObject({ seller_id: null, saved_offline: true });
    expect(mockCreateCustomerOffline).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: null })
    );
  });

  it('un error que no es de red se propaga y no encola nada', async () => {
    mockInsertFails = true;
    mockIsNetworkError.mockReturnValue(false);

    await expect(createCustomer({ name: 'Ana', idNumber: '123', phone: null })).rejects.toBeTruthy();
    expect(mockCreateCustomerOffline).not.toHaveBeenCalled();
  });
});
