import { fetchNegociosProducts } from '../negocioProductLinesService';

type Response = { data: unknown; error: unknown };
let mockResponse: Response = { data: [], error: null };
const mockIsNetworkError = jest.fn((_error: unknown) => false);
const mockLocal = jest.fn();
const mockIn = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (...args: unknown[]) => {
          mockIn(...args);
          return { is: () => ({ order: async () => mockResponse }) };
        },
      }),
    }),
  },
}));

jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: (error: unknown) => mockIsNetworkError(error),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: () => true,
  fetchNegociosProductsFromLocal: (ids: string[]) => mockLocal(ids),
}));

describe('fetchNegociosProducts', () => {
  beforeEach(() => {
    mockIsNetworkError.mockReturnValue(false);
    mockLocal.mockReset();
    mockIn.mockReset();
  });

  it('sin negocios no consulta nada', async () => {
    await expect(fetchNegociosProducts([])).resolves.toEqual(new Map());
    expect(mockIn).not.toHaveBeenCalled();
  });

  it('con señal pide todos los negocios en una sola consulta', async () => {
    mockResponse = {
      data: [
        { negocio_id: 'n1', quantity: '2', description: null, product: { name: 'Colchón', sku: 'C1' } },
        { negocio_id: 'n2', quantity: 1, description: null, product: { name: 'Base', sku: null } },
      ],
      error: null,
    };
    const result = await fetchNegociosProducts(['n1', 'n2']);
    expect(mockIn).toHaveBeenCalledWith('negocio_id', ['n1', 'n2']);
    expect(result.get('n1')).toEqual([{ name: 'Colchón', sku: 'C1', quantity: 2 }]);
    expect(result.get('n2')).toEqual([{ name: 'Base', sku: null, quantity: 1 }]);
  });

  it('sin señal lee los productos guardados en el teléfono', async () => {
    mockResponse = { data: null, error: new Error('Network request failed') };
    mockIsNetworkError.mockReturnValue(true);
    mockLocal.mockResolvedValue([
      { negocioId: 'n1', productName: 'Colchón', productSku: null, description: null, quantity: 1 },
    ]);
    const result = await fetchNegociosProducts(['n1']);
    expect(mockLocal).toHaveBeenCalledWith(['n1']);
    expect(result.get('n1')).toEqual([{ name: 'Colchón', sku: null, quantity: 1 }]);
  });

  it('un error que no es de red se propaga', async () => {
    mockResponse = { data: null, error: new Error('permiso') };
    await expect(fetchNegociosProducts(['n1'])).rejects.toThrow('permiso');
  });

  it('los negocios que el servidor aún no conoce (creados sin señal) salen del teléfono', async () => {
    mockResponse = {
      data: [{ negocio_id: 'n1', quantity: 1, description: null, product: { name: 'Base', sku: null } }],
      error: null,
    };
    mockLocal.mockResolvedValue([
      { negocioId: 'local-1', productName: 'Colchón', productSku: null, description: null, quantity: 2 },
    ]);
    const result = await fetchNegociosProducts(['n1', 'local-1']);
    expect(mockIn).toHaveBeenCalledTimes(1);
    expect(mockLocal).toHaveBeenCalledWith(['local-1']);
    expect(result.get('n1')).toEqual([{ name: 'Base', sku: null, quantity: 1 }]);
    expect(result.get('local-1')).toEqual([{ name: 'Colchón', sku: null, quantity: 2 }]);
  });
});
