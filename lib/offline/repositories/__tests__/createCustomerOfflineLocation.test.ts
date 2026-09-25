/**
 * Alta de cliente sin señal: la ubicación también debe quedar en la fila local,
 * porque el asistente de negocio la lee de ahí para rellenar el paso de
 * ubicación al elegir a ese cliente.
 */
import { createCustomerOffline, fetchCustomerFromLocal } from '../offlineRepository';

const mockPrepareOutboxRecord = jest.fn(() => ({ op: 'outbox' }));
let mockCustomers: Array<Record<string, unknown>> = [];
let mockKeySeq = 0;

jest.mock('@/lib/offline/database', () => ({
  isDatabaseOpen: () => true,
  databaseGeneration: () => 1,
  getDatabase: () => ({
    get: () => ({
      query: () => ({ fetch: async () => mockCustomers }),
      prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
        const record: Record<string, unknown> = { _raw: {} };
        fn(record);
        return { op: 'create', record };
      },
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: async (...ops: Array<{ op: string; record?: Record<string, unknown> }>) => {
      for (const op of ops) {
        if (op.op === 'create' && op.record) {
          const raw = op.record._raw as { id: string };
          mockCustomers.push({ ...op.record, id: raw.id });
        }
      }
    },
  }),
}));

jest.mock('@/lib/offline/sync/outbox', () => ({
  prepareOutboxRecord: (...args: unknown[]) => mockPrepareOutboxRecord(...(args as [])),
}));
jest.mock('@/lib/offline/sync/reconcile', () => ({ prepareRevertCommand: jest.fn() }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(), refreshPendingCount: jest.fn() }));
jest.mock('@/lib/offline/security/localFiles', () => ({
  persistPagoSupportFile: jest.fn(),
  deleteLocalPagoSupportFile: jest.fn(),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({ PAGO_SUPPORT_BUCKET: 'pago-supports' }));
jest.mock('@/lib/idempotency', () => ({ createIdempotencyKey: () => `key-${++mockKeySeq}` }));

describe('createCustomerOffline: ubicación en la fila local', () => {
  beforeEach(() => {
    mockCustomers = [];
    mockKeySeq = 0;
    mockPrepareOutboxRecord.mockClear();
  });

  it('guarda dirección, municipio y vereda y se leen con fetchCustomerFromLocal', async () => {
    const created = await createCustomerOffline({
      name: 'Ana',
      idNumber: '123',
      phone: null,
      address: ' Vereda El Cairo, casa 3 ',
      municipioId: 'm1',
      veredaId: 'v1',
      sellerId: 'u1',
    });

    await expect(fetchCustomerFromLocal(created.id)).resolves.toMatchObject({
      id: created.id,
      address: 'Vereda El Cairo, casa 3',
      municipioId: 'm1',
      veredaId: 'v1',
    });
    expect(mockPrepareOutboxRecord).toHaveBeenCalledWith(
      expect.anything(),
      'create_customer',
      expect.objectContaining({ municipioId: 'm1', veredaId: 'v1' }),
      expect.any(String)
    );
  });

  it('sin ubicación deja los tres campos en null', async () => {
    const created = await createCustomerOffline({ name: 'Ana', idNumber: '123', phone: null });

    await expect(fetchCustomerFromLocal(created.id)).resolves.toMatchObject({
      address: null,
      municipioId: null,
      veredaId: null,
    });
  });
});
