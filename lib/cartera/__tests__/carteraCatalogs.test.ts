import { loadCarteraCatalogs, resetCarteraCatalogs } from '../carteraCatalogs';
import { fetchMunicipios } from '../carteraService';
import { fetchSellerOptions } from '@/lib/users/sellersService';
import { fetchPaymentMethods } from '@/components/negocios/infrastructure/services/paymentMethodsService';

jest.mock('../carteraService', () => ({ fetchMunicipios: jest.fn() }));
jest.mock('@/lib/users/sellersService', () => ({ fetchSellerOptions: jest.fn() }));
jest.mock('@/components/negocios/infrastructure/services/paymentMethodsService', () => ({
  fetchPaymentMethods: jest.fn(),
}));

const mockedMunicipios = fetchMunicipios as jest.MockedFunction<typeof fetchMunicipios>;
const mockedSellers = fetchSellerOptions as jest.MockedFunction<typeof fetchSellerOptions>;
const mockedMethods = fetchPaymentMethods as jest.MockedFunction<typeof fetchPaymentMethods>;

describe('loadCarteraCatalogs', () => {
  beforeEach(() => {
    resetCarteraCatalogs();
    mockedMunicipios.mockReset().mockResolvedValue([{ id: 'm1', nombre: 'Pereira' }]);
    mockedSellers.mockReset().mockResolvedValue([{ id: 's1', full_name: 'Ana' }]);
    mockedMethods.mockReset().mockResolvedValue([{ id: 'p1', name: 'Efectivo' }]);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('pide los tres catálogos a la vez y los reutiliza en la sesión', async () => {
    const first = await loadCarteraCatalogs();

    expect(first.municipios).toHaveLength(1);
    expect(first.sellers).toHaveLength(1);
    expect(first.paymentMethods).toHaveLength(1);

    const second = await loadCarteraCatalogs();

    expect(second).toEqual(first);
    expect(mockedMunicipios).toHaveBeenCalledTimes(1);
    expect(mockedSellers).toHaveBeenCalledTimes(1);
    expect(mockedMethods).toHaveBeenCalledTimes(1);
  });

  it('comparte la petición entre dos cargas simultáneas', async () => {
    await Promise.all([loadCarteraCatalogs(), loadCarteraCatalogs()]);

    expect(mockedMunicipios).toHaveBeenCalledTimes(1);
  });

  it('un catálogo que falla no arrastra a los demás y se reintenta después', async () => {
    mockedSellers.mockRejectedValueOnce(new Error('Network request failed'));

    const first = await loadCarteraCatalogs();
    expect(first.sellers).toEqual([]);
    expect(first.municipios).toHaveLength(1);

    const second = await loadCarteraCatalogs();
    expect(second.sellers).toHaveLength(1);
    // Los que sí llegaron no se vuelven a pedir.
    expect(mockedMunicipios).toHaveBeenCalledTimes(1);
    expect(mockedSellers).toHaveBeenCalledTimes(2);
  });

  it('no memoriza una lista vacía (normalmente es una carga sin red)', async () => {
    mockedMethods.mockResolvedValueOnce([]);

    await loadCarteraCatalogs();
    await loadCarteraCatalogs();

    expect(mockedMethods).toHaveBeenCalledTimes(2);
  });
});
