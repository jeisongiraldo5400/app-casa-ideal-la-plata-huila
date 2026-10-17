jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  changeDraftSource,
  checkDraftSource,
  clearPreparedDraftOriginChange,
  readPreparedDraftOriginChange,
  savePreparedDraftOriginChange,
} from '../draftOriginChangeService';

const target = { remission_id: 'r1', source_delivery_order_id: 'r1' };

beforeEach(() => {
  const values = new Map<string, string>();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => values.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    values.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    values.delete(key);
  });
});

describe('draftOriginChangeService', () => {
  it('check manda la orden y devuelve las líneas', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { usable: true, lines: [{ product_id: 'p', product_name: 'Mesa', requested_quantity: 1, available_quantity: 1, missing_quantity: 0 }] },
      error: null,
    });
    const result = await checkDraftSource('n1', target, { rpc });
    expect(rpc).toHaveBeenCalledWith('check_negocio_draft_source', {
      p_negocio_id: 'n1',
      p_remission_id: 'r1',
      p_source_delivery_order_id: 'r1',
    });
    expect(result.usable).toBe(true);
    expect(result.lines).toHaveLength(1);
  });

  it('change manda la clave de idempotencia y propaga el error del servidor', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'La orden OE-1 no alcanza para el negocio: Mesa (pide 4, hay 3)', code: 'P0001' },
    });
    await expect(changeDraftSource('n1', target, 'clave', { rpc })).rejects.toMatchObject({
      message: 'La orden OE-1 no alcanza para el negocio: Mesa (pide 4, hay 3)',
      code: 'P0001',
    });
    expect(rpc).toHaveBeenCalledWith('change_negocio_draft_source', {
      p_negocio_id: 'n1',
      p_remission_id: 'r1',
      p_source_delivery_order_id: 'r1',
      p_idempotency_key: 'clave',
    });
  });

  it('guarda, lee y borra el cambio preparado sin señal por negocio', async () => {
    const change = {
      negocioId: 'n1',
      ...target,
      kind: 'remision' as const,
      label: 'Remisión OE-1 · productos propios',
      idempotencyKey: 'clave',
      preparedAt: '2026-10-16T10:00:00.000Z',
    };
    await savePreparedDraftOriginChange(change);
    expect(await readPreparedDraftOriginChange('n1')).toEqual(change);
    expect(await readPreparedDraftOriginChange('n2')).toBeNull();
    await clearPreparedDraftOriginChange('n1');
    expect(await readPreparedDraftOriginChange('n1')).toBeNull();
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });
});
