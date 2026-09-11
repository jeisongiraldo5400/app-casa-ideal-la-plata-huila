import { fetchPaymentMethods } from '../paymentMethodsService';

const mockFrom = jest.fn();
const mockFetchLocal = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  fetchPaymentMethodsFromLocal: (...args: unknown[]) => mockFetchLocal(...args),
}));

/** Query builder falso: select/is/order encadenan y el objeto es thenable. */
function chain(result: { data: unknown; error: unknown } | Error) {
  const obj: Record<string, unknown> = {};
  ['select', 'is', 'order'].forEach((method) => {
    obj[method] = jest.fn(() => obj);
  });
  obj.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
  return obj;
}

describe('fetchPaymentMethods', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFetchLocal.mockReset();
  });

  it('con red lee los métodos vigentes ordenados por nombre, sin tocar la base local', async () => {
    const query = chain({ data: [{ id: 'pm-1', name: 'Efectivo' }], error: null });
    mockFrom.mockReturnValue(query);

    await expect(fetchPaymentMethods()).resolves.toEqual([{ id: 'pm-1', name: 'Efectivo' }]);
    expect(mockFrom).toHaveBeenCalledWith('payment_methods');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.order).toHaveBeenCalledWith('name');
    expect(mockFetchLocal).not.toHaveBeenCalled();
  });

  it('sin red cae al catálogo descargado (el cobro offline exige elegir método)', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'Network request failed' } }));
    mockFetchLocal.mockResolvedValue([{ id: 'pm-2', name: 'Consignación' }]);

    await expect(fetchPaymentMethods()).resolves.toEqual([{ id: 'pm-2', name: 'Consignación' }]);
  });

  it('sin red y sin base local propaga el error de red', async () => {
    mockFrom.mockReturnValue(chain(new TypeError('Network request failed')));
    mockFetchLocal.mockResolvedValue(null);

    await expect(fetchPaymentMethods()).rejects.toThrow('Network request failed');
  });

  it('un error que no es de red (permisos) no se disfraza con el caché local', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'permission denied for table payment_methods' } }));

    await expect(fetchPaymentMethods()).rejects.toMatchObject({ message: expect.stringContaining('permission denied') });
    expect(mockFetchLocal).not.toHaveBeenCalled();
  });
});
