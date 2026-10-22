import { fetchSalePrice, fetchSalePrices } from '../salePricesService';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { canUseLocalCatalog } from '@/lib/offline/repositories/catalogRepository';
import { readLocalSalePrices } from '@/lib/offline/sync/salePrices';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/database', () => ({ getDatabase: jest.fn(() => ({})) }));
jest.mock('@/lib/offline/repositories/catalogRepository', () => ({ canUseLocalCatalog: jest.fn(() => true) }));
jest.mock('@/lib/offline/sync/salePrices', () => {
  const actual = jest.requireActual('@/lib/offline/sync/salePrices');
  const stored = { p1: 150000, p3: 89900 };
  return {
    ...actual,
    readLocalSalePrice: jest.fn(async (_db: unknown, id: string) => (stored as Record<string, number>)[id] ?? null),
    readLocalSalePrices: jest.fn(async () => stored),
  };
});

const rpc = supabase.rpc as unknown as jest.Mock;

describe('servicio de precio de venta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSyncStore.setState({ online: true });
    (canUseLocalCatalog as jest.Mock).mockReturnValue(true);
  });

  it('con señal pregunta al servidor solo por ese producto', async () => {
    rpc.mockResolvedValue({ data: [{ product_id: 'p1', price: 175000 }], error: null });
    await expect(fetchSalePrice('p1')).resolves.toBe(175000);
    expect(rpc).toHaveBeenCalledWith('get_product_sale_prices', { p_product_ids: ['p1'] });
  });

  it('con señal y sin precio en el servidor devuelve null (no usa lo viejo)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(fetchSalePrice('p1')).resolves.toBeNull();
  });

  it('sin señal usa lo bajado en la última descarga, sin llamar al servidor', async () => {
    useSyncStore.setState({ online: false });
    await expect(fetchSalePrice('p1')).resolves.toBe(150000);
    await expect(fetchSalePrice('p2')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('si el servidor falla o se cae la red, usa lo del teléfono', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchSalePrice('p1')).resolves.toBe(150000);
    rpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(fetchSalePrice('p1')).resolves.toBe(150000);
  });

  it('sin base local y sin señal: null, nunca lanza', async () => {
    useSyncStore.setState({ online: false });
    (canUseLocalCatalog as jest.Mock).mockReturnValue(false);
    await expect(fetchSalePrice('p1')).resolves.toBeNull();
  });

  it('en lote (inventario): servidor con señal, teléfono sin ella', async () => {
    rpc.mockResolvedValue({ data: [{ product_id: 'p3', price: 90000 }], error: null });
    await expect(fetchSalePrices(['p1', 'p3', 'p3'])).resolves.toEqual({ p3: 90000 });
    expect(rpc).toHaveBeenCalledWith('get_product_sale_prices', { p_product_ids: ['p1', 'p3'] });

    useSyncStore.setState({ online: false });
    await expect(fetchSalePrices(['p1', 'p2'])).resolves.toEqual({ p1: 150000 });
    expect(readLocalSalePrices).toHaveBeenCalled();
    await expect(fetchSalePrices([])).resolves.toEqual({});
  });
});
