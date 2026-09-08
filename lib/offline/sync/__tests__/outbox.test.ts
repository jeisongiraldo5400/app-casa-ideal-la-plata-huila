import { recoverInterruptedOutbox } from '../outbox';

describe('recoverInterruptedOutbox', () => {
  it('devuelve comandos interrumpidos a pending para reintento idempotente', async () => {
    type FakeOutboxItem = {
      status: string;
      lastError: string | null;
      nextRetryAt: number;
      update: (change: (record: FakeOutboxItem) => void) => Promise<void>;
    };
    const item: FakeOutboxItem = {
      status: 'syncing',
      lastError: null,
      nextRetryAt: 0,
      update: async (change) => change(item),
    };
    const database = {
      get: () => ({
        query: () => ({ fetch: async () => [item] }),
      }),
      write: async (work: () => Promise<void>) => work(),
    };

    await expect(recoverInterruptedOutbox(database as never, 1234)).resolves.toBe(1);
    expect(item.status).toBe('pending');
    expect(item.nextRetryAt).toBe(1234);
    expect(item.lastError).toMatch(/interrumpida/i);
  });
});
