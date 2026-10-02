import { supabase } from '@/lib/supabase';
import { getOrCreatePersistentIdempotencyKey, clearPersistentIdempotencyKey } from '@/lib/idempotency';
import {
  confirmTransferReturn,
  dispatchTransfer,
  fetchMyTransferTasks,
  fetchTransferDetail,
  isTransfersUnavailableError,
  receiveTransfer,
} from '../transfersService';
import { runIdempotentTransferWrite } from '../transferSubmission';
import { rawDetail, rawOrder } from '../../../__fixtures__/transferFixtures';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/idempotency', () => ({
  getOrCreatePersistentIdempotencyKey: jest.fn(async () => 'key-1'),
  clearPersistentIdempotencyKey: jest.fn(async () => undefined),
}));

const rpc = supabase.rpc as jest.Mock;

describe('transfersService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tareas y detalle se parsean', async () => {
    rpc.mockResolvedValueOnce({ data: { to_receive: [rawOrder()] }, error: null });
    const tasks = await fetchMyTransferTasks();
    expect(rpc).toHaveBeenCalledWith('get_my_transfer_tasks');
    expect(tasks.toReceive[0].orderNumber).toBe('TR-2026-0001');

    rpc.mockResolvedValueOnce({ data: rawDetail(), error: null });
    const detail = await fetchTransferDetail('t-1');
    expect(rpc).toHaveBeenLastCalledWith('get_transfer_order_detail', { p_transfer_order_id: 't-1' });
    expect(detail.items).toHaveLength(2);
    expect(detail.receiversAssigned).toBe(false);
    expect(detail.receiverOptions).toEqual([]);
  });

  it('despacho: envía líneas, transportador, notas, receptores y la clave', async () => {
    rpc.mockResolvedValueOnce({ data: { transfer_order_id: 't-1', order_number: 'TR-1', status: 'in_transit' }, error: null });
    await dispatchTransfer({
      transferOrderId: 't-1',
      items: [{ item_id: 'i-1', quantity: 2 }],
      carrierUserId: 'u-9',
      notes: '  ',
      receiverIds: ['u-recv'],
      idempotencyKey: 'k',
    });
    expect(rpc).toHaveBeenCalledWith('dispatch_transfer_order', {
      p_transfer_order_id: 't-1',
      p_items: [{ item_id: 'i-1', quantity: 2 }],
      p_carrier_user_id: 'u-9',
      p_notes: undefined,
      p_idempotency_key: 'k',
      p_receiver_ids: ['u-recv'],
    });
  });

  it('recepción con faltante y devolución', async () => {
    rpc.mockResolvedValue({ data: { transfer_order_id: 't-1', status: 'with_differences' }, error: null });
    await receiveTransfer({ transferOrderId: 't-1', items: [], reportMissing: true, notes: 'no llegó', idempotencyKey: 'k' });
    expect(rpc).toHaveBeenLastCalledWith('receive_transfer_order', {
      p_transfer_order_id: 't-1',
      p_items: [],
      p_notes: 'no llegó',
      p_report_missing: true,
      p_idempotency_key: 'k',
    });
    await confirmTransferReturn({ transferOrderId: 't-1', items: [{ item_id: 'i-1', quantity: 1 }], notes: '', idempotencyKey: 'k2' });
    expect(rpc).toHaveBeenLastCalledWith('confirm_transfer_return', {
      p_transfer_order_id: 't-1',
      p_items: [{ item_id: 'i-1', quantity: 1 }],
      p_notes: undefined,
      p_idempotency_key: 'k2',
    });
  });

  it('propaga el error del servidor tal cual (en español)', async () => {
    const error = { code: '42501', message: 'Quien despachó el traslado no puede recibirlo' };
    rpc.mockResolvedValueOnce({ data: null, error });
    await expect(
      receiveTransfer({ transferOrderId: 't-1', items: [], reportMissing: false, notes: '', idempotencyKey: 'k' })
    ).rejects.toBe(error);
  });

  it('reconoce un servidor sin las RPC de traslados', () => {
    expect(isTransfersUnavailableError({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isTransfersUnavailableError({ code: 'P0001', message: 'otro' })).toBe(false);
  });
});

describe('runIdempotentTransferWrite', () => {
  beforeEach(() => jest.clearAllMocks());

  it('usa la clave guardada y la borra tras el éxito', async () => {
    const run = jest.fn(async (key: string) => key);
    await expect(runIdempotentTransferWrite('transfer_receive', { id: 't-1' }, run)).resolves.toBe('key-1');
    expect(getOrCreatePersistentIdempotencyKey).toHaveBeenCalledWith('transfer_receive', '{"id":"t-1"}');
    expect(clearPersistentIdempotencyKey).toHaveBeenCalledWith('transfer_receive', '{"id":"t-1"}');
  });

  it('una caída de red conserva la clave para reintentar con la misma', async () => {
    const run = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(runIdempotentTransferWrite('transfer_dispatch', { id: 't-1' }, run)).rejects.toThrow();
    expect(clearPersistentIdempotencyKey).not.toHaveBeenCalled();
  });

  it('un rechazo del servidor la descarta', async () => {
    const run = jest.fn(async () => {
      throw { code: 'P0001', message: 'El traslado TR-1 no está por despachar (estado: in_transit)' };
    });
    await expect(runIdempotentTransferWrite('transfer_dispatch', { id: 't-1' }, run)).rejects.toBeTruthy();
    expect(clearPersistentIdempotencyKey).toHaveBeenCalled();
  });
});
