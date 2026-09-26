/**
 * Alta de cliente sin señal: el documento se compara como en el servidor
 * (20261219120000). «1.234.567» y «1234567» son el mismo cliente.
 */
import { DuplicateCustomerDocumentError } from '@/lib/customers/customerDocument';
import { createCustomerOffline } from '../offlineRepository';

let mockCustomers: Array<Record<string, unknown>> = [];
const mockQueries: unknown[] = [];

jest.mock('@/lib/offline/database', () => ({
  isDatabaseOpen: () => true,
  databaseGeneration: () => 1,
  getDatabase: () => ({
    get: () => ({
      query: (...conditions: unknown[]) => {
        mockQueries.push(conditions);
        return { fetch: async () => mockCustomers };
      },
      prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
        const record: Record<string, unknown> = { _raw: {} };
        fn(record);
        return { op: 'create', record };
      },
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: async () => undefined,
  }),
}));
jest.mock('@/lib/offline/sync/outbox', () => ({ prepareOutboxRecord: jest.fn(() => ({ op: 'outbox' })) }));
jest.mock('@/lib/offline/sync/reconcile', () => ({ prepareRevertCommand: jest.fn() }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(), refreshPendingCount: jest.fn() }));
jest.mock('@/lib/offline/security/localFiles', () => ({
  persistPagoSupportFile: jest.fn(),
  deleteLocalPagoSupportFile: jest.fn(),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({ PAGO_SUPPORT_BUCKET: 'pago-supports' }));

const input = (idNumber: string) => ({ name: 'Nuevo', idNumber, phone: null });

describe('createCustomerOffline: documento por letras y dígitos', () => {
  beforeEach(() => {
    mockCustomers = [{ id: 'c1', name: 'Ana Pérez', idNumber: '1234567' }];
    mockQueries.length = 0;
  });

  it('rechaza «1.234.567» si el teléfono ya tiene «1234567», con el cliente en el error', async () => {
    const error = await createCustomerOffline(input('1.234.567')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateCustomerDocumentError);
    expect((error as DuplicateCustomerDocumentError).existing).toEqual({
      id: 'c1',
      name: 'Ana Pérez',
      id_number: '1234567',
      deleted: false,
    });
    expect((error as Error).message).toBe('Ya existe un cliente con el documento 1234567 (Ana Pérez).');
  });

  it('solo pide los candidatos que contienen su último dígito, no el directorio', async () => {
    await createCustomerOffline(input('1.234.567')).catch(() => undefined);
    expect(mockQueries[0]).toEqual([['id_number', { like: '%7%' }]]);
  });

  it('un documento distinto se crea', async () => {
    mockCustomers = [{ id: 'c1', name: 'Ana Pérez', idNumber: '12345678' }];
    await expect(createCustomerOffline(input('1.234.567'))).resolves.toMatchObject({ name: 'Nuevo' });
  });
});
