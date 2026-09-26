/**
 * Un negocio creado sin señal que el usuario descartó en «Cambios sin
 * sincronizar» (su `create_negocio` quedó en `discarded`) sigue guardado en el
 * teléfono, pero no sale en la lista de Negocios. Tampoco debe salir en la
 * ficha del cliente sin señal, en la cartera local ni en Mis cobros.
 */
import { fetchCarteraFromLocal, fetchCustomerNegociosFromLocal } from '../offlineRepository';
import { loadMisCobrosFromLocal } from '../misCobrosRepository';

type Row = Record<string, unknown> & { id: string };
let mockTables: Record<string, Row[]> = {};

/** En las pruebas `Q.where(col, v)` es `[col, v]` (jest.setup.js). */
type Clause = [string, unknown];
const mockColumn: Record<string, string> = { type: 'type', negocio_id: 'negocioId', sync_status: 'rowSyncStatus' };

jest.mock('@/lib/offline/database', () => ({
  isDatabaseOpen: () => true,
  databaseGeneration: () => 1,
  getDatabase: () => ({
    get: (table: string) => ({
      query: (...clauses: Clause[]) => ({
        fetch: async () =>
          (mockTables[table] || []).filter((row) =>
            clauses.every((clause) => !Array.isArray(clause) || row[mockColumn[clause[0]] || clause[0]] === clause[1])
          ),
      }),
      find: async (id: string) => {
        const row = (mockTables[table] || []).find((item) => item.id === id);
        if (!row) throw new Error('no encontrado');
        return row;
      },
    }),
  }),
}));
jest.mock('@/lib/offline/sync/reconcile', () => ({ prepareRevertCommand: jest.fn() }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(), refreshPendingCount: jest.fn() }));
jest.mock('@/lib/offline/security/localFiles', () => ({
  persistPagoSupportFile: jest.fn(),
  deleteLocalPagoSupportFile: jest.fn(),
}));
jest.mock('@/lib/uploadPagoSupport', () => ({ PAGO_SUPPORT_BUCKET: 'pago-supports' }));

const negocio = (id: string, numero: number, rowSyncStatus = 'synced'): Row => ({
  id,
  numero,
  status: 'activo',
  dealDate: '2026-09-01',
  totalCredit: 300000,
  remainingBalance: 300000,
  customerId: 'c1',
  codeudorCustomerId: null,
  direccion: 'Calle 1',
  municipioId: 'm1',
  municipioName: 'Rionegro',
  sellerId: 'u1',
  sellerName: 'Vendedor',
  gestorCobroId: null,
  createdBy: 'u1',
  createdByName: 'Vendedor',
  rowSyncStatus,
});

const cuota = (id: string, negocioId: string): Row => ({
  id,
  negocioId,
  installmentNumber: 1,
  dueDate: '2026-10-01',
  amount: 100000,
  paidAmount: 0,
  lateFeeAmount: 0,
  status: 'pendiente',
});

const pago = (id: string, negocioId: string): Row => ({
  id,
  negocioId,
  cuotaId: null,
  amount: 50000,
  paidAt: '2026-09-20T10:00:00Z',
  receiptStatus: 'emitido',
  rowSyncStatus: 'synced',
});

const createCommand = (id: string, negocioId: string, status: string): Row => ({
  id,
  type: 'create_negocio',
  status,
  payloadJson: JSON.stringify({ negocioId }),
});

const carteraQuery = { filter: 'todas' as const, search: '', days: 7, municipioId: '', page: 1, pageSize: 50 };

describe('negocios descartados por el usuario, fuera de la ficha, la cartera y Mis cobros', () => {
  beforeEach(() => {
    // n1 vive en el servidor; n2 se descartó; n3 se descartó y luego se volvió
    // a encolar (un comando vivo gana: no cuenta como descartado).
    mockTables = {
      customers: [{ id: 'c1', name: 'Ana', idNumber: '123', phone: null, sellerId: 'u1' }],
      negocios: [negocio('n1', 20260001), negocio('n2', 0, 'rejected'), negocio('n3', 0, 'rejected')],
      negocio_cuotas: [cuota('q1', 'n1'), cuota('q2', 'n2'), cuota('q3', 'n3')],
      negocio_pagos: [pago('p1', 'n1'), pago('p2', 'n2'), pago('p3', 'n3')],
      profiles: [],
      sync_outbox: [
        createCommand('o2', 'n2', 'discarded'),
        createCommand('o3a', 'n3', 'discarded'),
        createCommand('o3b', 'n3', 'failed'),
      ],
    };
  });

  it('la ficha del cliente sin señal no lista el negocio descartado', async () => {
    const result = await fetchCustomerNegociosFromLocal('c1');
    expect(result?.negocios.map((row) => row.negocio_id).sort()).toEqual(['n1', 'n3']);
  });

  it('la cartera local no trae cuotas del negocio descartado', async () => {
    const result = await fetchCarteraFromLocal(carteraQuery);
    expect(result?.rows.map((row) => row.negocio_id).sort()).toEqual(['n1', 'n3']);
    expect(result?.totalCount).toBe(2);
  });

  it('Mis cobros sin señal no trae pagos del negocio descartado', async () => {
    const rows = await loadMisCobrosFromLocal();
    expect(rows?.map((row) => row.negocio_id).sort()).toEqual(['n1', 'n3']);
  });

  it('sin comandos descartados todo sigue saliendo', async () => {
    mockTables.sync_outbox = [];
    const ficha = await fetchCustomerNegociosFromLocal('c1');
    expect(ficha?.negocios).toHaveLength(3);
    expect((await fetchCarteraFromLocal(carteraQuery))?.totalCount).toBe(3);
    expect(await loadMisCobrosFromLocal()).toHaveLength(3);
  });
});
