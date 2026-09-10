import { supabase } from '@/lib/supabase';
import {
  deliveryOrderSerialKey,
  fetchDeliveryOrderSerials,
  fetchExitSerialsByExitId,
  serialMatchesQuery,
} from '../exitSerialsService';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockedRpc = supabase.rpc as jest.Mock;

describe('exitSerialsService', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warnSpy.mockRestore());

  it('no consulta cuando no hay salidas', async () => {
    await expect(fetchExitSerialsByExitId([])).resolves.toEqual({});
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('agrupa por salida, sin ids repetidos y con la clave normalizada', async () => {
    mockedRpc.mockResolvedValue({
      data: [
        { inventory_exit_id: 'exit-1', product_id: 'p1', serial_number: 'ab-12 3', capture_method: 'manual', released_reason: 'returned', released_at: 'x', created_at: 'y' },
        { inventory_exit_id: 'exit-2', product_id: 'p2', serial_number: 'ZX9', capture_method: 'scan', released_reason: null, released_at: null, created_at: 'y' },
      ],
      error: null,
    });

    const result = await fetchExitSerialsByExitId(['exit-1', 'exit-2', 'exit-1']);

    expect(mockedRpc).toHaveBeenCalledWith('get_exit_serials', { p_exit_ids: ['exit-1', 'exit-2'] });
    expect(result['exit-1']).toEqual([
      { inventoryExitId: 'exit-1', productId: 'p1', serial: 'ab-12 3', normalized: 'AB123', method: 'manual', releasedReason: 'returned' },
    ]);
    expect(result['exit-2'][0].method).toBe('scan');
  });

  it('un error del servidor deja el resultado vacío sin lanzar', async () => {
    mockedRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(fetchExitSerialsByExitId(['exit-1'])).resolves.toEqual({});

    mockedRpc.mockRejectedValue(new Error('Network request failed'));
    await expect(fetchDeliveryOrderSerials('order-1')).resolves.toEqual({});
  });

  it('agrupa los seriales de una orden por producto y bodega', async () => {
    mockedRpc.mockResolvedValue({
      data: [
        { product_id: 'p1', warehouse_id: 'w1', warehouse_name: 'Principal', inventory_exit_id: 'e1', serial_number: 'A1', capture_method: 'scan', released_reason: null, exit_created_at: '2026-09-10T15:00:00Z' },
        { product_id: 'p1', warehouse_id: 'w2', warehouse_name: 'Norte', inventory_exit_id: 'e2', serial_number: 'A2', capture_method: 'manual', released_reason: 'exit_cancelled', exit_created_at: '2026-09-10T16:00:00Z' },
      ],
      error: null,
    });

    const result = await fetchDeliveryOrderSerials('order-1');

    expect(mockedRpc).toHaveBeenCalledWith('get_delivery_order_serials', { p_delivery_order_id: 'order-1' });
    expect(Object.keys(result).sort()).toEqual([deliveryOrderSerialKey('p1', 'w1'), deliveryOrderSerialKey('p1', 'w2')]);
    expect(result[deliveryOrderSerialKey('p1', 'w2')][0]).toMatchObject({
      serial: 'A2',
      warehouseName: 'Norte',
      releasedReason: 'exit_cancelled',
      exitCreatedAt: '2026-09-10T16:00:00Z',
    });
  });

  it('busca seriales con la misma normalización que al capturarlos', () => {
    const serial = { normalized: 'AB12345' };
    expect(serialMatchesQuery(serial, 'ab-123')).toBe(true);
    expect(serialMatchesQuery(serial, ' 12 345 ')).toBe(true);
    expect(serialMatchesQuery(serial, 'zz')).toBe(false);
    expect(serialMatchesQuery(serial, '--')).toBe(false);
  });
});
