import { applyPullPayload, pruneOutOfScopeNegocios } from '../applyPull';
import type { PullPayload } from '../types';

function emptyChanges() {
  return { upserts: [], deleted: [] };
}

describe('applyPullPayload', () => {
  it('aplica upserts y deletes en un lote atómico', async () => {
    const operations: unknown[] = [];
    const records = new Map<string, { destroyed?: boolean; name?: string }>();

    const fakeRecord = (id: string) => ({
      id,
      prepareUpdate: (fn: (record: { name: string }) => void) => {
        const draft = { name: records.get(id)?.name || '' };
        fn(draft as never);
        records.set(id, { ...records.get(id), ...draft });
        return { id, op: 'update' };
      },
      prepareDestroyPermanently: () => {
        records.delete(id);
        return { id, op: 'destroy' };
      },
    });

    const database = {
      get: (table: string) => ({
        find: async (id: string) => {
          if (!records.has(`${table}:${id}`)) throw new Error('not found');
          return fakeRecord(`${table}:${id}`);
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          const id = `${table}:${String(record._raw && (record._raw as { id?: string }).id || 'new')}`;
          records.set(id, { name: String(record.name || '') });
          return { id, op: 'create' };
        },
        query: () => ({
          fetch: async () => [],
        }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async (...ops: unknown[]) => {
        operations.push(...ops);
      },
    };

    const payload: PullPayload = {
      server_time: '2026-08-12T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: {
        upserts: [{ id: 'c1', name: 'Ana', id_number: '1', phone: null, updated_at: null, deleted_at: null }],
        deleted: ['gone'],
      },
      negocios: emptyChanges(),
      negocio_cuotas: emptyChanges(),
      negocio_pagos: emptyChanges(),
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };

    await applyPullPayload(database as never, payload, 'user-1');
    expect(operations.length).toBeGreaterThan(0);
    expect(records.get('customers:c1')?.name).toBe('Ana');
  });

  it('no pisa una fila local con cambios pendientes de enviar', async () => {
    const updates: string[] = [];
    const pendingCuota = {
      id: 'q1',
      rowSyncStatus: 'pending',
      prepareUpdate: () => {
        updates.push('q1');
        return { id: 'q1', op: 'update' };
      },
    };
    const syncedCuota = {
      id: 'q2',
      rowSyncStatus: 'synced',
      prepareUpdate: (fn: (record: Record<string, unknown>) => void) => {
        fn({});
        updates.push('q2');
        return { id: 'q2', op: 'update' };
      },
    };
    const database = {
      get: (table: string) => ({
        find: async (id: string) => {
          if (table !== 'negocio_cuotas') throw new Error('not found');
          if (id === 'q1') return pendingCuota;
          if (id === 'q2') return syncedCuota;
          throw new Error('not found');
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          return { op: 'create' };
        },
        query: () => ({ fetch: async () => [] }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };
    const cuota = (id: string) => ({
      id,
      negocio_id: 'n1',
      installment_number: 1,
      due_date: '2026-09-01',
      amount: 100,
      paid_amount: 0,
      late_fee_amount: 0,
      status: 'pendiente',
      updated_at: null,
      deleted_at: null,
    });
    const payload: PullPayload = {
      server_time: '2026-08-12T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: emptyChanges(),
      negocios: emptyChanges(),
      negocio_cuotas: { upserts: [cuota('q1'), cuota('q2')], deleted: [] },
      negocio_pagos: emptyChanges(),
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };

    await applyPullPayload(database as never, payload, 'user-1');
    expect(updates).toEqual(['q2']);
  });
});

describe('pruneOutOfScopeNegocios', () => {
  it('elimina negocios fuera de alcance y conserva los que tienen cambios pendientes', async () => {
    const destroyed: string[] = [];
    const row = (table: string, id: string, extra: Record<string, unknown> = {}) => ({
      id,
      rowSyncStatus: 'synced',
      ...extra,
      prepareDestroyPermanently: () => {
        destroyed.push(`${table}:${id}`);
        return { op: 'destroy' };
      },
    });
    const tables: Record<string, unknown[]> = {
      negocios: [row('negocios', 'keep'), row('negocios', 'reassigned'), row('negocios', 'dirty')],
      negocio_cuotas: [
        row('negocio_cuotas', 'c1', { negocioId: 'reassigned' }),
        row('negocio_cuotas', 'c2', { negocioId: 'dirty', rowSyncStatus: 'pending' }),
      ],
      negocio_pagos: [row('negocio_pagos', 'p1', { negocioId: 'reassigned' })],
    };
    const database = {
      get: (table: string) => ({ query: () => ({ fetch: async () => tables[table] || [] }) }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };

    const removed = await pruneOutOfScopeNegocios(database as never, ['keep']);
    expect(removed).toBe(1);
    expect(destroyed.sort()).toEqual(['negocio_cuotas:c1', 'negocio_pagos:p1', 'negocios:reassigned']);
  });
});
