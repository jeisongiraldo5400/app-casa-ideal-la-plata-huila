/**
 * Cerrar la jornada sin señal: la ruta queda completada en el teléfono, las
 * paradas pendientes (y la actual) pasan a «No visitada» con el motivo, las
 * atendidas no cambian y el comando viaja con closePending para el servidor.
 */
import { enqueueRouteCommand } from '../offlineRepository';

type Op = { op: 'create' | 'update'; table?: string; id?: string; changes: Record<string, unknown> };

const mockBatch = jest.fn();
const mockPrepareOutboxRecord = jest.fn();
let mockTables: Record<string, Array<Record<string, unknown>>> = {};

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
  databaseGeneration: () => 1,
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
              if (column === 'route_id') return row.routeId === value;
              if (column === 'status') return row.status === value;
              return true;
            })
          ),
      }),
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: (...ops: Op[]) => mockBatch(...ops),
  }),
}));

jest.mock('@/lib/offline/sync/outbox', () => ({
  prepareOutboxRecord: (...args: unknown[]) => mockPrepareOutboxRecord(...args),
}));
jest.mock('@/lib/offline/sync/reconcile', () => ({ prepareRevertCommand: jest.fn() }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(), refreshPendingCount: jest.fn() }));
jest.mock('@/lib/offline/security/localFiles', () => ({
  persistPagoSupportFile: jest.fn(),
  deleteLocalPagoSupportFile: jest.fn(),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({ PAGO_SUPPORT_BUCKET: 'pago-supports' }));

const stop = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  mockRecord('collection_route_stops', {
    id, routeId: 'r1', position: Number(id.replace(/\D/g, '')), status,
    outcomeReason: null, notes: null, paymentId: null, paymentAmount: null,
    arrivedAt: null, completedAt: null, rowSyncStatus: 'synced', ...extra,
  });

function seed() {
  mockTables = {
    collection_routes: [
      mockRecord('collection_routes', {
        id: 'r1', status: 'activa', startedAt: '2026-09-25T12:00:00.000Z', completedAt: null, rowSyncStatus: 'synced',
      }),
    ],
    collection_route_stops: [
      stop('s1', 'cobrado'),
      stop('s2', 'sin_pago', { outcomeReason: 'No tenía' }),
      stop('s3', 'actual'),
      stop('s4', 'pendiente'),
      mockRecord('collection_route_stops', { id: 'otra', routeId: 'r2', position: 1, status: 'pendiente' }),
    ],
  };
}

const updates = () => (mockBatch.mock.calls[0] as Op[]).filter((op) => op.op === 'update');

describe('enqueueRouteCommand · cerrar jornada', () => {
  beforeEach(() => {
    mockBatch.mockReset();
    mockPrepareOutboxRecord.mockReset();
    mockPrepareOutboxRecord.mockImplementation((_db, type, payload) => ({
      op: 'create', table: 'sync_outbox', changes: { type, payload },
    }));
    seed();
  });

  it('pendientes y actual → no visitada con motivo; la ruta queda completada', async () => {
    await expect(
      enqueueRouteCommand({ type: 'finish_route', routeId: 'r1', cancel: false, closePending: true, reason: ' Lluvia ' })
    ).resolves.toBe(true);

    const ops = updates();
    expect(ops.find((op) => op.table === 'collection_routes')?.changes).toMatchObject({
      status: 'completada', rowSyncStatus: 'pending',
    });
    const stopChanges = ops.filter((op) => op.table === 'collection_route_stops');
    expect(stopChanges.map((op) => op.id).sort()).toEqual(['s3', 's4']);
    for (const op of stopChanges) {
      expect(op.changes).toEqual({ status: 'no_visitada', outcomeReason: 'Lluvia', rowSyncStatus: 'pending' });
    }

    const [, type, payload] = mockPrepareOutboxRecord.mock.calls[0];
    expect(type).toBe('finish_route');
    expect(payload).toMatchObject({ routeId: 'r1', cancel: false, closePending: true, reason: ' Lluvia ' });
    // El snapshot guarda cómo estaban las paradas para revertir si el servidor rechaza.
    expect(payload.snapshot.stops.map((row: { id: string; status: string }) => `${row.id}:${row.status}`).sort())
      .toEqual(['s3:actual', 's4:pendiente']);
  });

  it('sin closePending no toca las paradas (como antes)', async () => {
    await enqueueRouteCommand({ type: 'finish_route', routeId: 'r1', cancel: false });
    expect(updates().filter((op) => op.table === 'collection_route_stops')).toHaveLength(0);
  });

  it('cancelar no marca paradas aunque llegue closePending', async () => {
    await enqueueRouteCommand({ type: 'finish_route', routeId: 'r1', cancel: true, closePending: true });
    const ops = updates();
    expect(ops.find((op) => op.table === 'collection_routes')?.changes).toMatchObject({ status: 'cancelada' });
    expect(ops.filter((op) => op.table === 'collection_route_stops')).toHaveLength(0);
  });

  it('motivo vacío: no visitada sin motivo', async () => {
    await enqueueRouteCommand({ type: 'finish_route', routeId: 'r1', cancel: false, closePending: true, reason: '  ' });
    const stopChanges = updates().filter((op) => op.table === 'collection_route_stops');
    expect(stopChanges.every((op) => op.changes.outcomeReason === null)).toBe(true);
  });
});
