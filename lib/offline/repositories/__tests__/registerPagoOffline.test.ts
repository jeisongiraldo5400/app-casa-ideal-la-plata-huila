/**
 * Cobro sin red: fila optimista + cuotas FIFO + saldo del negocio + comando en
 * el outbox, en un único batch. Lo que viaje en el payload es lo que llega al
 * RPC al sincronizar (método y sitio de pago incluidos).
 */
import { registerPagoOffline } from '../offlineRepository';

type Op = { op: 'create' | 'update'; table?: string; id?: string; changes: Record<string, unknown> };

const mockBatch = jest.fn();
const mockPrepareOutboxRecord = jest.fn();
const mockRunSync = jest.fn();
const mockRefreshPendingCount = jest.fn();
let mockTables: Record<string, Array<Record<string, unknown>>> = {};
let mockKeySeq = 0;

function mockRecord(table: string, fields: Record<string, unknown>) {
  return {
    ...fields,
    prepareUpdate: (fn: (draft: Record<string, unknown>) => void): Op => {
      const changes: Record<string, unknown> = {};
      fn(changes);
      return { op: 'update', table, id: String(fields.id), changes };
    },
  };
}

jest.mock('@/lib/offline/database', () => ({
  isDatabaseOpen: () => true,
  getDatabase: () => ({
    get: (table: string) => ({
      find: async (id: string) => {
        const row = (mockTables[table] || []).find((item) => item.id === id);
        if (!row) throw new Error(`${table} ${id} no encontrado`);
        return row;
      },
      query: (...clauses: unknown[][]) => ({
        fetch: async () =>
          (mockTables[table] || []).filter((row) =>
            clauses.every(([column, value]) => {
              if (column === 'negocio_id') return row.negocioId === value;
              return true;
            })
          ),
      }),
      prepareCreate: (fn: (record: Record<string, unknown>) => void): Op => {
        const record: Record<string, unknown> = { _raw: {} };
        fn(record);
        return { op: 'create', table, changes: record };
      },
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: (...ops: Op[]) => mockBatch(...ops),
  }),
}));

jest.mock('@/lib/offline/sync/outbox', () => ({
  prepareOutboxRecord: (...args: unknown[]) => mockPrepareOutboxRecord(...args),
}));

jest.mock('@/lib/offline/sync/reconcile', () => ({ prepareRevertCommand: jest.fn() }));

jest.mock('@/lib/offline/sync/syncEngine', () => ({
  runSync: (...args: unknown[]) => mockRunSync(...args),
  refreshPendingCount: (...args: unknown[]) => mockRefreshPendingCount(...args),
}));

jest.mock('@/lib/offline/security/localFiles', () => ({
  persistPagoSupportFile: jest.fn(),
  deleteLocalPagoSupportFile: jest.fn(),
}));

jest.mock('@/lib/uploadPagoSupport', () => ({ PAGO_SUPPORT_BUCKET: 'pago-supports' }));

jest.mock('@/lib/idempotency', () => ({
  createIdempotencyKey: () => `key-${++mockKeySeq}`,
}));

function seed() {
  mockTables = {
    negocios: [mockRecord('negocios', { id: 'neg-1', remainingBalance: 300_000 })],
    negocio_cuotas: [
      mockRecord('negocio_cuotas', {
        id: 'cuota-2', negocioId: 'neg-1', dueDate: '2026-10-01', amount: 100_000,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
      mockRecord('negocio_cuotas', {
        id: 'cuota-1', negocioId: 'neg-1', dueDate: '2026-09-01', amount: 100_000,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
      mockRecord('negocio_cuotas', {
        id: 'cuota-3', negocioId: 'neg-1', dueDate: '2026-11-01', amount: 100_000,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
      mockRecord('negocio_cuotas', {
        id: 'otra', negocioId: 'neg-9', dueDate: '2026-08-01', amount: 999_999,
        paidAmount: 0, lateFeeAmount: 0, status: 'pendiente', rowSyncStatus: 'synced',
      }),
    ],
  };
}

const baseInput = {
  negocioId: 'neg-1',
  amount: 150_000,
  paidAt: '2026-09-10T15:00:00.000Z',
  receiptNumber: 'R-77',
  paymentMethodId: 'pm-1',
  paymentMethodName: 'Efectivo',
  registeredBy: 'Gestor Uno',
};

describe('registerPagoOffline', () => {
  beforeEach(() => {
    mockKeySeq = 0;
    mockBatch.mockReset();
    mockRunSync.mockReset();
    mockRefreshPendingCount.mockReset();
    mockPrepareOutboxRecord.mockReset();
    mockPrepareOutboxRecord.mockImplementation((_db, type, payload, key) => ({
      op: 'create',
      table: 'sync_outbox',
      changes: { type, payload, key },
    }));
    seed();
  });

  it('guarda el pago con método y sitio app_movil, aplica FIFO y encola el comando', async () => {
    const result = await registerPagoOffline({ ...baseInput, idempotencyKey: 'idem-pantalla' });

    expect(result).toEqual({ pagoLocalId: 'key-1', pendingReceipt: true, supportWarning: null });
    expect(mockBatch).toHaveBeenCalledTimes(1);
    const ops = mockBatch.mock.calls[0] as Op[];

    const pago = ops.find((op) => op.table === 'negocio_pagos');
    expect(pago?.changes).toMatchObject({
      negocioId: 'neg-1',
      cuotaId: null,
      amount: 150_000,
      receiptNumber: 'R-77',
      receiptStatus: 'emitido',
      paymentMethodId: 'pm-1',
      paymentMethodName: 'Efectivo',
      paymentSite: 'app_movil',
      createdByName: 'Gestor Uno',
      rowSyncStatus: 'pending',
    });
    expect((pago?.changes._raw as { id: string }).id).toBe('key-1');

    // FIFO por vencimiento: la cuota de septiembre se paga completa y la de octubre queda parcial.
    const cuotaUpdates = ops.filter((op) => op.table === 'negocio_cuotas');
    expect(cuotaUpdates).toEqual([
      { op: 'update', table: 'negocio_cuotas', id: 'cuota-1', changes: { paidAmount: 100_000, status: 'pagada', rowSyncStatus: 'pending' } },
      { op: 'update', table: 'negocio_cuotas', id: 'cuota-2', changes: { paidAmount: 50_000, status: 'parcial', rowSyncStatus: 'pending' } },
    ]);
    expect(ops.find((op) => op.table === 'negocios')?.changes).toEqual({ remainingBalance: 150_000 });

    const [, type, payload, key] = mockPrepareOutboxRecord.mock.calls[0];
    expect(type).toBe('register_pago');
    expect(key).toBe('idem-pantalla');
    expect(payload).toMatchObject({
      pagoLocalId: 'key-1',
      negocioId: 'neg-1',
      amount: 150_000,
      paymentMethodId: 'pm-1',
      paymentSite: 'app_movil',
      routeStopId: null,
      lane: 'negocio:neg-1',
    });
    // El snapshot guarda el estado previo para poder revertir si el servidor rechaza.
    expect(payload.snapshot.negocio).toEqual({ id: 'neg-1', remainingBalance: 300_000 });
    expect(payload.snapshot.cuotas).toContainEqual({ id: 'cuota-1', paidAmount: 0, status: 'pendiente', rowSyncStatus: 'synced' });
    expect(ops[ops.length - 1].table).toBe('sync_outbox');

    expect(mockRunSync).toHaveBeenCalledWith('mutation');
  });

  it('sin clave de la pantalla genera una propia para el outbox', async () => {
    await registerPagoOffline(baseInput);

    expect(mockPrepareOutboxRecord.mock.calls[0][3]).toBe('key-2');
  });

  it('rechaza un valor mayor que el saldo de las cuotas descargadas sin escribir nada', async () => {
    await expect(registerPagoOffline({ ...baseInput, amount: 300_001 })).rejects.toThrow(
      'El valor supera el saldo pendiente de las cuotas descargadas.'
    );
    expect(mockBatch).not.toHaveBeenCalled();
    expect(mockPrepareOutboxRecord).not.toHaveBeenCalled();
  });

  it('acepta pagar exactamente el saldo y deja el negocio en cero', async () => {
    await registerPagoOffline({ ...baseInput, amount: 300_000 });

    const ops = mockBatch.mock.calls[0] as Op[];
    expect(ops.filter((op) => op.table === 'negocio_cuotas')).toHaveLength(3);
    expect(ops.find((op) => op.table === 'negocios')?.changes).toEqual({ remainingBalance: 0 });
  });

  it('pide descargar la información si el negocio no está en el dispositivo', async () => {
    await expect(registerPagoOffline({ ...baseInput, negocioId: 'neg-x' })).rejects.toThrow(
      /no está descargado en el dispositivo/
    );
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it('no registra si el negocio no tiene cuotas descargadas', async () => {
    mockTables.negocio_cuotas = [];

    await expect(registerPagoOffline(baseInput)).rejects.toThrow(/No hay cuotas descargadas/);
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
