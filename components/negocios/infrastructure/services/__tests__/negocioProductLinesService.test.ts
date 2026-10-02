import { fetchNegocioReceiptProducts, fetchNegociosProducts } from '../negocioProductLinesService';
import { useSyncStore } from '@/lib/offline/store/syncStore';

type Response = { data: unknown; error: unknown };
let mockResponse: Response = { data: [], error: null };
const mockIsNetworkError = jest.fn((_error: unknown) => false);
const mockLocal = jest.fn();
const mockIn = jest.fn();
const mockEq = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (...args: unknown[]) => {
          mockIn(...args);
          return { is: () => ({ order: async () => mockResponse }) };
        },
        eq: (...args: unknown[]) => {
          mockEq(...args);
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

describe('fetchNegocioReceiptProducts', () => {
  beforeEach(() => {
    mockIsNetworkError.mockReturnValue(false);
    mockLocal.mockReset();
    mockEq.mockReset();
    useSyncStore.setState({ online: true });
  });

  it('con señal lee los productos del negocio con el criterio del contrato (descripción primero)', async () => {
    mockResponse = {
      data: [
        { quantity: '2', description: 'Colchón doble', product: { name: 'COLCHON D' }, unit_price: '600000', subtotal: 1200000 },
        { quantity: 1, description: null, product: { name: 'Base' }, unit_price: 300000, subtotal: 300000 },
      ],
      error: null,
    };
    await expect(fetchNegocioReceiptProducts('n1')).resolves.toEqual([
      { quantity: 2, name: 'Colchón doble', unitPrice: 600000, subtotal: 1200000 },
      { quantity: 1, name: 'Base', unitPrice: 300000, subtotal: 300000 },
    ]);
    expect(mockEq).toHaveBeenCalledWith('negocio_id', 'n1');
    expect(mockLocal).not.toHaveBeenCalled();
  });

  it('sin señal sale de lo descargado en el teléfono (con precios) sin consultar el servidor', async () => {
    useSyncStore.setState({ online: false });
    mockLocal.mockResolvedValue([
      { negocioId: 'n1', productName: 'Colchón', productSku: null, description: null, quantity: 1, unitPrice: 500000, subtotal: 500000 },
      { negocioId: 'n1', productName: 'Base', productSku: null, description: null, quantity: 1 },
    ]);
    await expect(fetchNegocioReceiptProducts('n1')).resolves.toEqual([
      { quantity: 1, name: 'Colchón', unitPrice: 500000, subtotal: 500000 },
      { quantity: 1, name: 'Base', unitPrice: null, subtotal: null },
    ]);
    expect(mockEq).not.toHaveBeenCalled();
    expect(mockLocal).toHaveBeenCalledWith(['n1']);
  });

  it('si el servidor falla no lanza: usa el teléfono y, sin datos, devuelve vacío', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockResponse = { data: null, error: new Error('permiso') };
    mockLocal.mockResolvedValue([]);
    await expect(fetchNegocioReceiptProducts('n1')).resolves.toEqual([]);
    warn.mockRestore();
  });
});
