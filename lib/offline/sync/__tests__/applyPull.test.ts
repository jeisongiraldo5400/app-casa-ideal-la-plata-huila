import { applyPullPayload } from '../applyPull';
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
});
