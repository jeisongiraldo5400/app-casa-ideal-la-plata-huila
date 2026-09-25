import { NEGOCIO_CREATOR_COLUMNS, migrations } from '../../migrations';
import { schema } from '../../schema';
import { mapNegocioDetailFromLocal } from '../../domain/negociosLocal';
import { applyPullPayload, pruneCustomersOutsideNegocios } from '../applyPull';
import { cursorForCatalogPull } from '../catalogPull';
import {
  PULL_PAYLOAD_VERSION,
  PULL_SCOPE_CHANGED_MARKER,
  pullCursorForPayloadVersion,
  pullScopeChanged,
  type PullPayload,
} from '../types';

/**
 * 20261128120000: el negocio viaja con quién lo creó (el contrato sin señal
 * imprimía «—» en «CREADO POR»), y al recaudador puro sólo le bajan los
 * clientes de sus negocios (`pull_scope` = 'cobro').
 */

type AddColumnsStep = { type: string; table: string; columns: { name: string }[] };

function emptyChanges() {
  return { upserts: [], deleted: [] };
}

describe('esquema local v10: quién creó el negocio', () => {
  it('la migración a 10 agrega created_by y created_by_name a negocios, opcionales', () => {
    expect(schema.version).toBe(10);
    const toTen = migrations.sortedMigrations.find((migration) => migration.toVersion === 10);
    expect(toTen).toBeDefined();
    const steps = toTen!.steps as unknown as AddColumnsStep[];
    expect(steps).toEqual([{ type: 'add_columns', table: 'negocios', columns: NEGOCIO_CREATOR_COLUMNS }]);
    expect(NEGOCIO_CREATOR_COLUMNS.every((column) => column.isOptional)).toBe(true);
  });

  it('una instalación nueva trae las mismas columnas', () => {
    const tables = schema.tables as unknown as { name: string; columns: { name: string }[] }[];
    const negocios = tables.find((table) => table.name === 'negocios')!;
    for (const column of NEGOCIO_CREATOR_COLUMNS) {
      expect(negocios.columns.find((candidate) => candidate.name === column.name)).toEqual(column);
    }
  });

  it('la versión 8 del paquete fuerza una descarga completa a quien tenía la 7', () => {
    expect(PULL_PAYLOAD_VERSION).toBe('8');
    expect(pullCursorForPayloadVersion('2026-09-24T00:00:00Z', '7')).toBeNull();
  });
});

describe('applyPullPayload guarda quién creó el negocio', () => {
  it('copia created_by y created_by_name del paquete', async () => {
    const created: Record<string, Record<string, unknown>> = {};
    const database = {
      get: (table: string) => ({
        find: async () => {
          throw new Error('not found');
        },
        prepareCreate: (fn: (record: Record<string, unknown>) => void) => {
          const record: Record<string, unknown> = { _raw: { id: '' } };
          fn(record);
          created[`${table}:${(record._raw as { id: string }).id}`] = record;
          return { op: 'create' };
        },
        query: () => ({ fetch: async () => [] }),
      }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };
    const negocio = {
      id: 'n1',
      numero: 20260007,
      status: 'entregado',
      deal_date: '2026-09-01',
      total_credit: 300000,
      remaining_balance: 300000,
      customer_id: 'c1',
      codeudor_customer_id: null,
      direccion: null,
      municipio_id: null,
      municipio_name: null,
      seller_id: 's1',
      gestor_cobro_id: null,
      created_by: 'u9',
      created_by_name: 'Quien Registró',
      updated_at: '2026-09-24T00:00:00Z',
      deleted_at: null,
    };
    const payload: PullPayload = {
      server_time: '2026-09-24T00:00:00Z',
      must_wipe: false,
      truncated: false,
      roles: [],
      customers: emptyChanges(),
      negocios: { upserts: [negocio, { ...negocio, id: 'n2', created_by: undefined, created_by_name: undefined }], deleted: [] },
      negocio_cuotas: emptyChanges(),
      negocio_pagos: emptyChanges(),
      collection_routes: emptyChanges(),
      collection_route_stops: emptyChanges(),
      municipios: emptyChanges(),
    };

    await applyPullPayload(database as never, payload, 'user-1');
    expect(created['negocios:n1']).toMatchObject({ createdBy: 'u9', createdByName: 'Quien Registró' });
    // Servidor sin la migración: queda vacío y el contrato imprime una raya.
    expect(created['negocios:n2']).toMatchObject({ createdBy: null, createdByName: null });
  });
});

describe('detalle local del negocio', () => {
  it('expone el nombre de quien lo creó para el contrato', () => {
    const detail = mapNegocioDetailFromLocal({
      negocio: {
        id: 'n1',
        numero: 1,
        status: 'entregado',
        dealDate: null,
        totalCredit: 100,
        remainingBalance: 100,
        customerId: 'c1',
        codeudorCustomerId: null,
        direccion: null,
        municipioId: null,
        municipioName: null,
        sellerId: 's1',
        createdBy: 'u9',
        createdByName: 'Quien Registró',
      },
      customers: [{ id: 'c1', name: 'Ana', idNumber: '1', phone: null }],
      cuotas: [],
      pagos: [],
    });
    expect(detail.negocio.created_by).toBe('u9');
    expect(detail.negocio.created_by_name).toBe('Quien Registró');
  });
});

describe('alcance del pull (recaudador puro)', () => {
  it('detecta el cambio de alcance sólo si hay uno anterior y es distinto', () => {
    expect(pullScopeChanged(null, 'cobro')).toBe(false);
    expect(pullScopeChanged('cobro', undefined)).toBe(false);
    expect(pullScopeChanged('cobro', 'cobro')).toBe(false);
    expect(pullScopeChanged('cobro', 'completo')).toBe(true);
    expect(pullScopeChanged('completo', 'cobro')).toBe(true);
  });

  it('tras un cambio de alcance la próxima descarga es completa', () => {
    expect(pullCursorForPayloadVersion('2026-09-24T00:00:00Z', PULL_SCOPE_CHANGED_MARKER)).toBeNull();
  });

  it('borra los clientes descargados que no son de ningún negocio del teléfono', async () => {
    const destroyed: string[] = [];
    const row = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      rowSyncStatus: 'synced',
      ...extra,
      prepareDestroyPermanently: () => {
        destroyed.push(id);
        return { op: 'destroy' };
      },
    });
    const tables: Record<string, unknown[]> = {
      customers: [
        row('titular'),
        row('codeudor'),
        row('directorio'),
        // Creado sin señal: todavía no existe en el servidor.
        row('pendiente', { rowSyncStatus: 'pending' }),
      ],
      negocios: [{ id: 'n1', customerId: 'titular', codeudorCustomerId: 'codeudor' }],
    };
    const database = {
      get: (table: string) => ({ query: () => ({ fetch: async () => tables[table] || [] }) }),
      write: async (fn: () => Promise<void>) => fn(),
      batch: async () => undefined,
    };

    const removed = await pruneCustomersOutsideNegocios(database as never);
    expect(removed).toBe(1);
    expect(destroyed).toEqual(['directorio']);
  });
});

describe('cursor de un paquete con catálogo', () => {
  it('usa el más viejo de los dos cursores', () => {
    expect(cursorForCatalogPull('2026-09-24T00:00:00Z', '2026-09-20T00:00:00Z')).toBe('2026-09-20T00:00:00Z');
    expect(cursorForCatalogPull('2026-09-20T00:00:00Z', '2026-09-24T00:00:00Z')).toBe('2026-09-20T00:00:00Z');
  });

  it('baja todo si cualquiera de los dos falta (p. ej. tras subir la versión del paquete)', () => {
    expect(cursorForCatalogPull(null, '2026-09-20T00:00:00Z')).toBeNull();
    expect(cursorForCatalogPull('2026-09-24T00:00:00Z', null)).toBeNull();
  });
});
