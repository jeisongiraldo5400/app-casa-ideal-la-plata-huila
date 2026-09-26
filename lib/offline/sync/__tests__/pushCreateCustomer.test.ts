import { pushOutboxItem } from '../pushCommands';
import type { SyncOutboxItem } from '../../models';

/**
 * Alta de cliente sin señal al sincronizar: el correo viaja como `p_email`;
 * los comandos encolados antes del campo (o sin correo) no mandan `p_email` y
 * siguen llamando a la misma firma de siempre.
 */

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));

function outboxItem(payload: Record<string, unknown>): SyncOutboxItem {
  return {
    id: 'outbox-1',
    type: 'create_customer',
    payloadJson: JSON.stringify(payload),
    idempotencyKey: 'idem-1',
    status: 'pending',
    attempts: 0,
  } as unknown as SyncOutboxItem;
}

const base = { customerId: 'c-local', name: 'Ana', idNumber: '123', phone: null };

describe('pushOutboxItem · create_customer', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: { customer_id: 'c-local', conflict: false }, error: null });
  });

  it('envía el correo del comando como p_email', async () => {
    await expect(pushOutboxItem(outboxItem({ ...base, email: 'ana@correo.com' }))).resolves.toMatchObject({
      outcome: 'done',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_customer_offline',
      expect.objectContaining({ p_customer_id: 'c-local', p_idempotency_key: 'idem-1', p_email: 'ana@correo.com' })
    );
  });

  it('un comando viejo sin email no manda p_email', async () => {
    await expect(pushOutboxItem(outboxItem(base))).resolves.toMatchObject({ outcome: 'done' });

    const args = mockRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_email');
    expect(args).toMatchObject({ p_name: 'Ana', p_id_number: '123', p_address: null });
  });

  it('con email null tampoco manda p_email', async () => {
    await pushOutboxItem(outboxItem({ ...base, email: null }));

    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty('p_email');
  });
});
