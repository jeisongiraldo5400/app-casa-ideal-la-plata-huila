import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  getCachedSaleWarehouses,
  setCachedSaleWarehouses,
} from '@/lib/offline/security/secureKeys';
import {
  parseSaleWarehousesResponse,
  retainSaleWarehousesWatchers,
  useSaleWarehousesStore,
} from '../saleWarehousesStore';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/security/secureKeys', () => ({
  getCachedSaleWarehouses: jest.fn(async () => null),
  setCachedSaleWarehouses: jest.fn(async () => undefined),
}));
jest.mock('@/lib/errorMessage', () => ({ logHandledError: jest.fn() }));

const flush = () => new Promise((resolve) => setImmediate(resolve));
let appStateHandler: ((state: string) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    appStateHandler = handler as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  useSaleWarehousesStore.getState().reset();
});

describe('saleWarehousesStore', () => {
  it('lee get_my_sale_warehouses y guarda la caché del usuario', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { is_admin: false, warehouse_ids: ['w1', 'w2', 'w1'] },
      error: null,
    });
    useSaleWarehousesStore.getState().setUser('u1');
    await flush();

    expect(supabase.rpc).toHaveBeenCalledWith('get_my_sale_warehouses');
    expect(useSaleWarehousesStore.getState()).toMatchObject({
      isAdmin: false,
      warehouseIds: ['w1', 'w2'],
      source: 'network',
      loading: false,
      error: null,
    });
    expect(setCachedSaleWarehouses).toHaveBeenCalledWith({
      userId: 'u1',
      isAdmin: false,
      warehouseIds: ['w1', 'w2'],
    });
  });

  it('sin red usa la caché del mismo usuario', async () => {
    (getCachedSaleWarehouses as jest.Mock).mockResolvedValue({
      userId: 'u1',
      isAdmin: false,
      warehouseIds: ['w9'],
    });
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    useSaleWarehousesStore.getState().setUser('u1');
    await flush();
    await flush();

    expect(useSaleWarehousesStore.getState()).toMatchObject({
      warehouseIds: ['w9'],
      source: 'cache',
      error: null,
    });
  });

  it('no hereda la caché de otro usuario: queda sin bodegas y con error', async () => {
    (getCachedSaleWarehouses as jest.Mock).mockResolvedValue({
      userId: 'otro',
      isAdmin: true,
      warehouseIds: ['w9'],
    });
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    useSaleWarehousesStore.getState().setUser('u1');
    await flush();
    await flush();

    expect(useSaleWarehousesStore.getState()).toMatchObject({
      isAdmin: false,
      warehouseIds: [],
      source: 'none',
      loading: false,
    });
    expect(useSaleWarehousesStore.getState().error).toMatch(/bodegas de venta/);
  });

  it('al cerrar sesión se vacía', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { is_admin: false, warehouse_ids: ['w1'] },
      error: null,
    });
    useSaleWarehousesStore.getState().setUser('u1');
    await flush();
    useSaleWarehousesStore.getState().setUser(null);

    expect(useSaleWarehousesStore.getState()).toMatchObject({
      userId: null,
      warehouseIds: [],
      source: 'none',
    });
  });

  it('se refresca al volver la app al frente mientras haya consumidores', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { is_admin: false, warehouse_ids: ['w1'] },
      error: null,
    });
    useSaleWarehousesStore.getState().setUser('u1');
    const release = retainSaleWarehousesWatchers();
    await flush();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { is_admin: false, warehouse_ids: ['w1', 'w3'] },
      error: null,
    });
    appStateHandler?.('active');
    await flush();

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(useSaleWarehousesStore.getState().warehouseIds).toEqual(['w1', 'w3']);
    release();
  });

  it('valida la forma de la respuesta', () => {
    expect(parseSaleWarehousesResponse({ is_admin: true, warehouse_ids: null })).toEqual({
      isAdmin: true,
      warehouseIds: [],
    });
    expect(parseSaleWarehousesResponse('{"is_admin":false,"warehouse_ids":["w1",3]}')).toEqual({
      isAdmin: false,
      warehouseIds: ['w1'],
    });
    expect(() => parseSaleWarehousesResponse(null)).toThrow();
  });
});
