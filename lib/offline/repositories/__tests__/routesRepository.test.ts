/**
 * Rutas en la base local: la copia guardada de una ruta sigue al servidor
 * (altas, cambios y bajas de paradas) sin pisar cambios sin confirmar, y la
 * comprobación de «¿se puede trabajar sin señal?» mira negocio, cliente y cuotas.
 */
import {
  fetchRouteCandidatesFromLocal,
  readRouteLocalSnapshot,
  saveRouteCopyLocally,
} from '../routesRepository';
import type { CollectionRoute } from '@/lib/collection-routes/types';
import { EMPTY_ROUTE_LOCATION_FILTER } from '@/lib/collection-routes/types';

type Row = Record<string, unknown> & { id: string };
type Op = { op: 'create' | 'update' | 'destroy'; table: string; id: string; changes: Record<string, unknown> };

let mockTables: Record<string, Row[]> = {};
const mockBatch = jest.fn();

const mockColumn: Record<string, string> = {
  route_id: 'routeId',
  negocio_id: 'negocioId',
  gestor_cobro_id: 'gestorCobroId',
  status: 'status',
  id: 'id',
};

/** En las pruebas `Q.where(col, v)` es `[col, v]` y `Q.oneOf(vs)` es el arreglo (jest.setup.js). */
type Clause = [string, unknown];
function mockMatches(row: Row, [column, expected]: Clause) {
  const value = row[mockColumn[column] || column];
  return Array.isArray(expected) ? expected.includes(value) : value === expected;
}

function mockRecord(table: string, row: Row) {
  return {
    ...row,
    prepareUpdate: (fn: (draft: Record<string, unknown>) => void): Op => {
      const changes: Record<string, unknown> = {};
      fn(changes);
      return { op: 'update', table, id: row.id, changes };
    },
    prepareDestroyPermanently: (): Op => ({ op: 'destroy', table, id: row.id, changes: {} }),
  };
}

jest.mock('@/lib/offline/database', () => ({
  isDatabaseOpen: () => true,
  getDatabase: () => ({
    get: (table: string) => ({
      find: async (id: string) => {
        const row = (mockTables[table] || []).find((item) => item.id === id);
        if (!row) throw new Error(`${table} ${id} no encontrado`);
        return mockRecord(table, row);
      },
      query: (...clauses: Clause[]) => ({
        fetch: async () =>
          (mockTables[table] || [])
            .filter((row) => clauses.every((clause) => mockMatches(row, clause)))
            .map((row) => mockRecord(table, row)),
      }),
      prepareCreate: (fn: (record: Record<string, unknown> & { _raw: { id?: string } }) => void): Op => {
        const record = { _raw: {} as { id?: string } } as Record<string, unknown> & { _raw: { id?: string } };
        fn(record);
        const { _raw, ...changes } = record;
        return { op: 'create', table, id: String(_raw.id), changes };
      },
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: (...ops: Op[]) => mockBatch(...ops),
  }),
}));

jest.mock('../catalogRepository', () => ({
  fetchLocationCatalogsFromLocal: async () => ({ departamentos: [], municipios: [], veredas: [] }),
}));

const stop = (id: string, negocioId: string, position: number, status = 'pendiente') => ({
  id,
  negocio_id: negocioId,
  negocio_numero: position,
  position,
  status: status as CollectionRoute['stops'][number]['status'],
  customer_name: `Cliente ${negocioId}`,
  customer_phone: null,
  customer_address: 'Calle',
  municipality_name: null,
  expected_balance: 1000,
  payment_id: null,
  payment_amount: null,
  outcome_reason: null,
  notes: null,
  arrived_at: null,
  completed_at: null,
});

const ROUTE: CollectionRoute = {
  id: 'r1',
  gestor_id: 'g1',
  route_date: '2026-09-25',
  status: 'activa',
  started_at: '2026-09-25T13:00:00Z',
  completed_at: null,
  total_expected: 2000,
  total_collected: 0,
  stops: [stop('s2', 'n2', 1, 'actual'), stop('s3', 'n3', 2)],
};

const lastOps = (): Op[] => mockBatch.mock.calls.at(-1) ?? [];

beforeEach(() => {
  mockBatch.mockReset();
  mockTables = {};
});

describe('saveRouteCopyLocally', () => {
  it('con onlyIfSaved no baja una ruta que el gestor no descargó', async () => {
    await expect(saveRouteCopyLocally(ROUTE, { onlyIfSaved: true })).resolves.toBe(false);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it('al descargar crea la ruta y sus paradas', async () => {
    await expect(saveRouteCopyLocally(ROUTE, { onlyIfSaved: false })).resolves.toBe(true);
    const ops = lastOps();
    expect(ops.filter((op) => op.op === 'create').map((op) => `${op.table}:${op.id}`)).toEqual([
      'collection_routes:r1',
      'collection_route_stops:s2',
      'collection_route_stops:s3',
    ]);
    expect(ops[0].changes).toMatchObject({ status: 'activa', rowSyncStatus: 'synced', totalExpected: 2000 });
  });

  it('sigue al servidor: reordena, agrega y borra paradas quitadas, sin pisar lo pendiente', async () => {
    mockTables = {
      collection_routes: [{ id: 'r1', rowSyncStatus: 'synced' }],
      collection_route_stops: [
        { id: 's1', routeId: 'r1', rowSyncStatus: 'synced', position: 1 },
        { id: 's2', routeId: 'r1', rowSyncStatus: 'synced', position: 2 },
        { id: 's9', routeId: 'r1', rowSyncStatus: 'pending', position: 3 },
      ],
    };
    await saveRouteCopyLocally(ROUTE, { onlyIfSaved: true });
    const ops = lastOps().map((op) => `${op.op}:${op.id}`);
    expect(ops).toEqual(['update:r1', 'update:s2', 'create:s3', 'destroy:s1']);
    const s2 = lastOps().find((op) => op.id === 's2')!;
    expect(s2.changes).toMatchObject({ position: 1, status: 'actual' });
  });

  it('no toca una ruta con un cambio sin confirmar', async () => {
    mockTables = { collection_routes: [{ id: 'r1', rowSyncStatus: 'pending' }], collection_route_stops: [] };
    await saveRouteCopyLocally({ ...ROUTE, stops: [] }, { onlyIfSaved: true });
    expect(mockBatch).not.toHaveBeenCalled();
  });
});

describe('readRouteLocalSnapshot', () => {
  it('la ruta no está en el teléfono', async () => {
    await expect(readRouteLocalSnapshot('r1')).resolves.toEqual({
      routeExists: false,
      stopNegocioIds: [],
      readyNegocioIds: new Set(),
    });
  });

  it('solo cuenta listas las paradas con negocio, cliente y cuotas', async () => {
    mockTables = {
      collection_routes: [{ id: 'r1' }],
      collection_route_stops: [
        { id: 's3', routeId: 'r1', negocioId: 'n3', position: 2 },
        { id: 's2', routeId: 'r1', negocioId: 'n2', position: 1 },
        { id: 's4', routeId: 'r1', negocioId: 'n4', position: 3 },
      ],
      negocios: [
        { id: 'n2', customerId: 'c2' },
        { id: 'n3', customerId: 'c-sin-descargar' },
      ],
      negocio_cuotas: [
        { id: 'q2', negocioId: 'n2' },
        { id: 'q3', negocioId: 'n3' },
      ],
      customers: [{ id: 'c2' }],
    };
    const snapshot = await readRouteLocalSnapshot('r1');
    expect(snapshot.stopNegocioIds).toEqual(['n2', 'n3', 'n4']);
    expect(Array.from(snapshot.readyNegocioIds)).toEqual(['n2']);
  });
});

describe('fetchRouteCandidatesFromLocal', () => {
  it('arma los candidatos del gestor con lo descargado', async () => {
    mockTables = {
      negocios: [
        { id: 'n1', numero: 20260001, status: 'activo', gestorCobroId: 'g1', customerId: 'c1', direccion: 'Calle 1', municipioId: null },
        { id: 'n2', numero: 20260002, status: 'activo', gestorCobroId: 'otro', customerId: 'c1', direccion: 'Calle 2', municipioId: null },
      ],
      negocio_cuotas: [
        { id: 'q1', negocioId: 'n1', dueDate: '2026-10-01', amount: 1000, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
        { id: 'q2', negocioId: 'n2', dueDate: '2026-10-01', amount: 1000, paidAmount: 0, lateFeeAmount: 0, status: 'pendiente' },
      ],
      customers: [{ id: 'c1', name: 'José', idNumber: '1', phone: null, municipioId: null, veredaId: null }],
    };
    const result = await fetchRouteCandidatesFromLocal({
      userId: 'g1',
      today: '2026-09-25',
      query: { search: '', filter: 'todas', location: EMPTY_ROUTE_LOCATION_FILTER },
      page: 1,
      pageSize: 30,
    });
    expect(result?.rows.map((row) => row.negocio_id)).toEqual(['n1']);
    expect(result?.rows[0]).toMatchObject({ customer_name: 'José', expected_balance: 1000 });
  });
});
