import { OFFLINE_ORDER_TABLES, migrations } from '../../migrations';
import { schema } from '../../schema';
import {
  getLocalOfflineOrderLines,
  listLocalOfflineOrders,
  listLocalPendingRemissions,
  localOrdersSnapshotAt,
  pendingLocalQuantitiesByOrigin,
} from '../../repositories/deliveryOrdersRepository';
import { purgeUnselectedDomains, purgeUnsentNegocios, wipeLocalCatalog } from '../applyPull';
import { applyOrdersSnapshot } from '../ordersSnapshot';
import { requestPull, type PullRpc } from '../pullRequest';
import { classifyPushError, isDefinitiveOriginError } from '../retryPolicy';
import {
  domainsToMarkApplied,
  getLocalSyncConfig,
  hasPendingChoicesToDownload,
  isSelectiveSyncSupported,
  lastManualDownloadAt,
  manualFullDomains,
  markChoicesChangedLocally,
  markManualDownloadDone,
  markSelectiveSupport,
  parseSyncConfig,
  readAppliedRevisions,
  serverConfigDiffers,
  shouldSendSelectiveOptions,
  storeSyncConfigFromPayload,
  type LocalSyncConfig,
} from '../syncPrefs';
import { supabase } from '@/lib/supabase';
import { runSync } from '../syncEngine';
import { useSyncStore } from '../../store/syncStore';
import { PULL_PAYLOAD_VERSION, pullCursorForPayloadVersion, type PullPayload } from '../types';

/**
 * Descarga selectiva «Qué llevar en el teléfono» (20261130*): el motor pide
 * completos los dominios cuya selección cambió, borra lo que ya no se lleva
 * (sin tocar lo pendiente) y guarda la foto de órdenes y remisiones.
 */

type Row = Record<string, any>;

const mockDb = createFakeDatabase();

jest.mock('../../database', () => ({
  getDatabase: () => mockDb,
  isDatabaseOpen: () => true,
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), auth: { signOut: jest.fn(async () => undefined) } },
}));

jest.mock('../../security/secureKeys', () => ({
  setCachedProfileName: jest.fn(async () => undefined),
  setCachedRoles: jest.fn(async () => undefined),
  setLastOnlineVerifiedAt: jest.fn(async () => undefined),
}));

jest.mock('../../security/wipe', () => ({ wipeLocalOfflineData: jest.fn(async () => undefined) }));

function createFakeDatabase() {
  const tables = new Map<string, Map<string, Row>>();
  let seq = 0;
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const columnValue = (record: Row, column: string) => {
    const camel = column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    return record[camel] !== undefined ? record[camel] : record[column];
  };
  const matches = (record: Row, conditions: unknown[]) =>
    conditions.every((condition) => {
      const [column, expected] = condition as [string, unknown];
      const actual = columnValue(record, column);
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    });
  const makeRecord = (name: string, id: string, fields: Row = {}) => {
    const record: Row = { ...fields, id, _raw: { id } };
    record.prepareUpdate = (fn: (row: Row) => void) => ({ apply: () => fn(record) });
    record.update = async (fn: (row: Row) => void) => fn(record);
    record.prepareDestroyPermanently = () => ({ apply: () => table(name).delete(record.id) });
    return record;
  };
  const prepare = (name: string, fill: (row: Row) => void) => {
    const record = makeRecord(name, '');
    fill(record);
    record.id = record._raw.id || `${name}-${++seq}`;
    record._raw.id = record.id;
    return record;
  };
  return {
    get: (name: string) => ({
      query: (...conditions: unknown[]) => ({
        fetch: async () => [...table(name).values()].filter((row) => matches(row, conditions)),
        fetchCount: async () => [...table(name).values()].filter((row) => matches(row, conditions)).length,
      }),
      find: async (id: string) => {
        const found = table(name).get(id);
        if (!found) throw new Error('not found');
        return found;
      },
      prepareCreate: (fill: (row: Row) => void) => {
        const record = prepare(name, fill);
        return { apply: () => table(name).set(record.id, record) };
      },
      create: async (fill: (row: Row) => void) => {
        const record = prepare(name, fill);
        table(name).set(record.id, record);
        return record;
      },
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: async (...operations: { apply: () => void }[]) => {
      for (const operation of operations) operation.apply();
    },
    seed: (name: string, id: string, fields: Row) => {
      table(name).set(id, makeRecord(name, id, fields));
    },
    ids: (name: string) => [...table(name).keys()].sort(),
    rows: (name: string) => [...table(name).values()],
    meta: (key: string) => [...table('sync_meta').values()].find((row) => row.key === key)?.value ?? null,
    reset: () => {
      tables.clear();
      seq = 0;
    },
  };
}

function emptyChanges() {
  return { upserts: [], deleted: [] };
}

function basePayload(overrides: Partial<PullPayload> = {}): PullPayload {
  return {
    server_time: '2026-09-25T12:00:00Z',
    must_wipe: false,
    truncated: false,
    roles: [],
    customers: emptyChanges(),
    negocios: emptyChanges(),
    negocio_cuotas: emptyChanges(),
    negocio_pagos: emptyChanges(),
    collection_routes: emptyChanges(),
    collection_route_stops: emptyChanges(),
    municipios: emptyChanges(),
    ...overrides,
  };
}

function customer(id: string) {
  return { id, name: id, id_number: id, phone: null, seller_id: null, updated_at: null, deleted_at: null };
}

function product(id: string) {
  return { id, name: id, sku: null, barcode: null, category_id: null, brand_id: null, status: true, updated_at: null };
}

const CONFIG: LocalSyncConfig = {
  clientes: { mode: 'seleccion', revision: 3, count: 12 },
  productos: { mode: 'todo', revision: 1, count: null },
  ordenes: { revision: 2, count: 1 },
  municipios: null,
};

beforeEach(() => {
  mockDb.reset();
});

describe('esquema local v11', () => {
  it('la migración de la v10 a la v11 crea las tres tablas nuevas y nada más', () => {
    expect(schema.version).toBe(11);
    expect(migrations.maxVersion).toBe(11);
    const toEleven = migrations.sortedMigrations.find((migration) => migration.toVersion === 11)!;
    const steps = toEleven.steps as unknown as { type: string; schema: { name: string } }[];
    expect(steps.map((step) => [step.type, step.schema.name])).toEqual([
      ['create_table', 'delivery_orders_local'],
      ['create_table', 'delivery_order_lines'],
      ['create_table', 'pending_remissions'],
    ]);
  });

  it('una instalación nueva trae las mismas tablas, con order_id indexado', () => {
    const tables = schema.tables as unknown as { name: string; columns: { name: string; isIndexed?: boolean }[] }[];
    for (const expected of OFFLINE_ORDER_TABLES) {
      expect(tables.find((candidate) => candidate.name === expected.name)).toEqual(expected);
    }
    const lines = tables.find((candidate) => candidate.name === 'delivery_order_lines')!;
    expect(lines.columns.find((column) => column.name === 'order_id')?.isIndexed).toBe(true);
  });

  it('la versión 9 del paquete fuerza una descarga completa a quien tenía la 8', () => {
    expect(PULL_PAYLOAD_VERSION).toBe('9');
    expect(pullCursorForPayloadVersion('2026-09-24T00:00:00Z', '8')).toBeNull();
  });
});

describe('petición del pull con p_options', () => {
  const OPTIONS = { full_domains: ['clientes' as const], orders: true };
  const INPUT = {
    lastPulledAt: '2026-09-24T00:00:00Z',
    catalogCursor: '2026-09-20T00:00:00Z',
    includeCatalog: false,
    limit: 2000,
    options: OPTIONS,
  };

  it('envía p_options y, si el servidor lo acepta, lo da por soportado', async () => {
    const rpc = jest.fn(async () => ({ data: { ok: true }, error: null }));

    const result = await requestPull(rpc as unknown as PullRpc, INPUT);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('pull_mobile_sync', {
      p_last_pulled_at: '2026-09-24T00:00:00Z',
      p_limit: 2000,
      p_options: { full_domains: ['clientes'], orders: true },
    });
    expect(result).toMatchObject({ data: { ok: true }, error: null, selective: 'supported' });
  });

  it('con catálogo pide desde el cursor del catálogo y lleva los dos parámetros', async () => {
    const rpc = jest.fn(async () => ({ data: {}, error: null }));

    await requestPull(rpc as unknown as PullRpc, { ...INPUT, includeCatalog: true });

    expect(rpc).toHaveBeenCalledWith('pull_mobile_sync', {
      p_last_pulled_at: '2026-09-20T00:00:00Z',
      p_limit: 2000,
      p_include_catalog: true,
      p_options: OPTIONS,
    });
  });

  it('servidor sin p_options: reintenta sin él y lo marca no soportado', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
      .mockResolvedValueOnce({ data: { viejo: true }, error: null });

    const result = await requestPull(rpc as unknown as PullRpc, { ...INPUT, includeCatalog: true });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({
      p_last_pulled_at: '2026-09-20T00:00:00Z',
      p_limit: 2000,
      p_include_catalog: true,
    });
    expect(result).toMatchObject({ data: { viejo: true }, error: null, selective: 'unsupported' });
  });

  it('servidor sin p_options ni catálogo: tercer intento con la firma de dos argumentos', async () => {
    const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    const rpc = jest
      .fn()
      .mockResolvedValueOnce(missing)
      .mockResolvedValueOnce(missing)
      .mockResolvedValueOnce({ data: { muyViejo: true }, error: null });

    const result = await requestPull(rpc as unknown as PullRpc, { ...INPUT, includeCatalog: true });

    expect(rpc.mock.calls[2][1]).toEqual({ p_last_pulled_at: '2026-09-24T00:00:00Z', p_limit: 2000 });
    expect(result.selective).toBe('unsupported');
    expect(result.data).toEqual({ muyViejo: true });
  });

  it('sin opciones (servidor conocido como antiguo) no manda p_options', async () => {
    const rpc = jest.fn(async () => ({ data: {}, error: null }));

    const result = await requestPull(rpc as unknown as PullRpc, { ...INPUT, options: null });

    expect(rpc.mock.calls[0]).toEqual([
      'pull_mobile_sync',
      { p_last_pulled_at: '2026-09-24T00:00:00Z', p_limit: 2000 },
    ]);
    expect(result.selective).toBe('unknown');
  });

  it('un error que no es de firma no esconde los ajustes', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { code: '57014', message: 'canceling statement' } }));

    const result = await requestPull(rpc as unknown as PullRpc, INPUT);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.selective).toBe('unknown');
    expect(result.error).toMatchObject({ code: '57014' });
  });

  it('con un servidor antiguo se vuelve a probar p_options al día siguiente', () => {
    const now = Date.parse('2026-09-25T12:00:00Z');
    expect(shouldSendSelectiveOptions({ supported: null, checkedAt: null, now })).toBe(true);
    expect(shouldSendSelectiveOptions({ supported: 'true', checkedAt: now, now })).toBe(true);
    expect(shouldSendSelectiveOptions({ supported: 'false', checkedAt: now - 1000, now })).toBe(false);
    expect(shouldSendSelectiveOptions({ supported: 'false', checkedAt: now - 25 * 3600 * 1000, now })).toBe(true);
  });
});

describe('preferencias y revisiones', () => {
  it('toda descarga manual pide completos los clientes', () => {
    expect(manualFullDomains()).toEqual(['clientes']);
  });

  it('productos entiende «ninguno»; lo desconocido cuenta como «todo»', () => {
    expect(parseSyncConfig({ productos: { mode: 'ninguno', revision: 2 } })?.productos.mode).toBe('ninguno');
    expect(parseSyncConfig({ productos: { mode: 'seleccion', revision: 2 } })?.productos.mode).toBe('todo');
  });

  it('guarda sync_config y la revisión de lo que vino completo y sin recortar', async () => {
    const payload = basePayload({
      sync_config: { clientes: { mode: 'seleccion', revision: 3 }, productos: { mode: 'todo', revision: 1 }, ordenes: { revision: 2 } },
      full_domains_sent: ['clientes', 'productos'],
      catalog_included: false,
    });

    await storeSyncConfigFromPayload(mockDb as never, payload, { catalogApplied: false });

    expect(await readAppliedRevisions(mockDb as never)).toEqual({ clientes: 3, productos: null });
    expect(await getLocalSyncConfig()).toEqual({
      clientes: { mode: 'seleccion', revision: 3, count: null },
      productos: { mode: 'todo', revision: 1, count: null },
      ordenes: { revision: 2, count: null },
      municipios: null,
    });
  });

  it('un paquete recortado guarda la configuración pero no da la revisión por aplicada', async () => {
    const payload = basePayload({
      truncated: true,
      sync_config: { clientes: { mode: 'seleccion', revision: 4 } },
      full_domains_sent: ['clientes'],
    });

    expect(domainsToMarkApplied(payload, { catalogApplied: true })).toEqual([]);
    await storeSyncConfigFromPayload(mockDb as never, payload, { catalogApplied: true });
    expect(await readAppliedRevisions(mockDb as never)).toEqual({ clientes: null, productos: null });
    expect((await getLocalSyncConfig())?.clientes.revision).toBe(4);
  });

  it('isSelectiveSyncSupported sólo es true tras un pull con p_options aceptado', async () => {
    expect(await isSelectiveSyncSupported()).toBe(false);
    await markSelectiveSupport(mockDb as never, true);
    expect(await isSelectiveSyncSupported()).toBe(true);
    await markSelectiveSupport(mockDb as never, false);
    expect(await isSelectiveSyncSupported()).toBe(false);
  });

  it('parseSyncConfig tolera un servidor sin sync_config', () => {
    expect(parseSyncConfig(undefined)).toBeNull();
    expect(parseSyncConfig({ clientes: { mode: 'raro', revision: '7' } })?.clientes).toEqual({
      mode: 'todo',
      revision: 7,
      count: null,
    });
  });
});

describe('última descarga y elecciones pendientes de descargar', () => {
  it('lastManualDownloadAt es null hasta la primera descarga manual', async () => {
    expect(await lastManualDownloadAt()).toBeNull();
    await markManualDownloadDone(mockDb as never, 1000);
    expect(await lastManualDownloadAt()).toBe(1000);
  });

  it('marcar desde este teléfono deja «pendiente de descargar» hasta la siguiente descarga', async () => {
    await markManualDownloadDone(mockDb as never, 1000);
    expect(await hasPendingChoicesToDownload()).toBe(false);
    await markChoicesChangedLocally(2000);
    expect(await hasPendingChoicesToDownload()).toBe(true);
    await markManualDownloadDone(mockDb as never, 3000);
    expect(await hasPendingChoicesToDownload()).toBe(false);
  });

  it('también avisa si la configuración del servidor ya no es la descargada', async () => {
    await storeSyncConfigFromPayload(
      mockDb as never,
      basePayload({ sync_config: { clientes: { mode: 'seleccion', revision: 3, count: 10 }, ordenes: { revision: 1 } } }),
      { catalogApplied: false }
    );
    await markManualDownloadDone(mockDb as never, 1000);
    const same = { clientes: { mode: 'seleccion', revision: 3, count: 10 }, ordenes: { revision: 1 } };
    expect(await hasPendingChoicesToDownload(same)).toBe(false);
    // Marcar un cliente no sube la revisión, pero sí el conteo.
    expect(await hasPendingChoicesToDownload({ ...same, clientes: { mode: 'seleccion', revision: 3, count: 11 } })).toBe(true);
    expect(await hasPendingChoicesToDownload({ ...same, productos: { mode: 'ninguno', revision: 2 } })).toBe(true);
    expect(await hasPendingChoicesToDownload({ ...same, ordenes: { revision: 2 } })).toBe(true);
  });

  it('nunca descargado: cualquier configuración del servidor está pendiente', () => {
    expect(serverConfigDiffers(null, { clientes: { mode: 'todo', revision: 1 } })).toBe(true);
    expect(serverConfigDiffers(CONFIG, null)).toBe(false);
  });
});

describe('purga de negocios tras una descarga manual completa', () => {
  function seedNegocios() {
    mockDb.seed('negocios', 'n-viene', { customerId: 'c1', rowSyncStatus: 'synced' });
    mockDb.seed('negocios', 'n-fuera', { customerId: 'c2', rowSyncStatus: 'synced' });
    mockDb.seed('negocios', 'n-pendiente', { customerId: 'c3', rowSyncStatus: 'pending' });
    mockDb.seed('negocios', 'n-rechazado', { customerId: 'c3', rowSyncStatus: 'rejected' });
    mockDb.seed('negocios', 'n-cobro-pendiente', { customerId: 'c4', rowSyncStatus: 'synced' });
    mockDb.seed('negocios', 'n-outbox', { customerId: 'c5', rowSyncStatus: 'synced' });
    mockDb.seed('negocio_cuotas', 'q-viene', { negocioId: 'n-viene', rowSyncStatus: 'synced' });
    mockDb.seed('negocio_cuotas', 'q-vieja', { negocioId: 'n-viene', rowSyncStatus: 'synced' });
    mockDb.seed('negocio_cuotas', 'q-fuera', { negocioId: 'n-fuera', rowSyncStatus: 'synced' });
    mockDb.seed('negocio_cuotas', 'q-cobro', { negocioId: 'n-cobro-pendiente', rowSyncStatus: 'pending' });
    mockDb.seed('negocio_pagos', 'p-fuera', { negocioId: 'n-fuera', rowSyncStatus: 'synced' });
    mockDb.seed('negocio_pagos', 'p-rechazado', { negocioId: 'n-cobro-pendiente', rowSyncStatus: 'rejected' });
    mockDb.seed('negocio_items', 'i-fuera', { negocioId: 'n-fuera', rowSyncStatus: 'synced' });
    mockDb.seed('negocio_items', 'i-viejo', { negocioId: 'n-viene', rowSyncStatus: 'synced' });
    mockDb.seed('sync_outbox', 'o-pago', {
      type: 'register_pago',
      status: 'failed',
      payloadJson: JSON.stringify({ negocioId: 'n-outbox', amount: 1 }),
    });
  }

  const negocio = (id: string) => ({
    id,
    numero: 1,
    status: 'activo',
    deal_date: null,
    total_credit: 1,
    remaining_balance: 1,
    customer_id: 'c1',
    codeudor_customer_id: null,
    direccion: null,
    municipio_id: null,
    municipio_name: null,
    seller_id: null,
    gestor_cobro_id: null,
    updated_at: null,
    deleted_at: null,
  });

  function negociosPayload(overrides: Partial<PullPayload> = {}) {
    return basePayload({
      full_domains_sent: ['clientes', 'negocios'],
      negocios: { upserts: [negocio('n-viene')], deleted: [] },
      negocio_cuotas: {
        upserts: [
          {
            id: 'q-viene',
            negocio_id: 'n-viene',
            installment_number: 1,
            due_date: '2026-10-01',
            amount: 1,
            paid_amount: 0,
            late_fee_amount: 0,
            status: 'pendiente',
            updated_at: null,
            deleted_at: null,
          },
        ],
        deleted: [],
      },
      negocio_items: emptyChanges(),
      ...overrides,
    });
  }

  it('borra negocios, cuotas, pagos e ítems que no vinieron, nunca lo pendiente', async () => {
    seedNegocios();

    expect(await purgeUnsentNegocios(mockDb as never, negociosPayload())).toBe(true);

    expect(mockDb.ids('negocios')).toEqual(
      ['n-cobro-pendiente', 'n-outbox', 'n-pendiente', 'n-rechazado', 'n-viene'].sort()
    );
    expect(mockDb.ids('negocio_cuotas')).toEqual(['q-cobro', 'q-viene']);
    expect(mockDb.ids('negocio_pagos')).toEqual(['p-rechazado']);
    expect(mockDb.ids('negocio_items')).toEqual([]);
  });

  it('sin negocios completos o con el paquete recortado no se purga (queda la poda por alcance)', async () => {
    seedNegocios();

    expect(await purgeUnsentNegocios(mockDb as never, negociosPayload({ full_domains_sent: ['clientes'] }))).toBe(false);
    expect(await purgeUnsentNegocios(mockDb as never, negociosPayload({ truncated: true }))).toBe(false);
    expect(mockDb.ids('negocios')).toContain('n-fuera');
    expect(mockDb.ids('negocio_cuotas')).toContain('q-vieja');
  });
});

describe('productos en «ninguno»', () => {
  it('borra el catálogo local salvo los productos de negocios sin confirmar', async () => {
    mockDb.seed('negocios', 'n-local', { customerId: 'c1', rowSyncStatus: 'pending' });
    mockDb.seed('negocio_items', 'i1', { negocioId: 'n-local', productId: 'p-local', rowSyncStatus: 'pending' });
    mockDb.seed('sync_outbox', 'o1', {
      type: 'create_negocio',
      status: 'pending',
      payloadJson: JSON.stringify({ negocio: {}, items: [{ product_id: 'p-cola' }] }),
    });
    for (const id of ['p-local', 'p-cola', 'p-otro']) mockDb.seed('catalog_products', id, {});
    mockDb.seed('catalog_warehouse_stock', 's-otro', { productId: 'p-otro' });
    mockDb.seed('catalog_warehouse_stock', 's-cola', { productId: 'p-cola' });
    mockDb.seed('catalog_warehouses', 'w1', { name: 'Andes' });

    await wipeLocalCatalog(mockDb as never);

    expect(mockDb.ids('catalog_products')).toEqual(['p-cola', 'p-local']);
    expect(mockDb.ids('catalog_warehouse_stock')).toEqual(['s-cola']);
    // Las bodegas se quedan: nombran los ítems de los negocios.
    expect(mockDb.ids('catalog_warehouses')).toEqual(['w1']);
  });
});

describe('purga de lo que ya no se lleva', () => {
  function seedPhone() {
    mockDb.seed('customers', 'c-sel', { rowSyncStatus: 'synced' });
    mockDb.seed('customers', 'c-fuera', { rowSyncStatus: 'synced' });
    mockDb.seed('customers', 'c-pendiente', { rowSyncStatus: 'pending' });
    mockDb.seed('customers', 'c-rechazado', { rowSyncStatus: 'rejected' });
    mockDb.seed('customers', 'c-negocio', { rowSyncStatus: 'synced' });
    mockDb.seed('customers', 'c-codeudor', { rowSyncStatus: 'synced' });
    mockDb.seed('customers', 'c-outbox', { rowSyncStatus: 'synced' });
    mockDb.seed('negocios', 'n1', {
      customerId: 'c-negocio',
      codeudorCustomerId: 'c-codeudor',
      rowSyncStatus: 'synced',
    });
    mockDb.seed('negocios', 'n-local', { customerId: 'c-sel', codeudorCustomerId: null, rowSyncStatus: 'pending' });
    mockDb.seed('negocio_items', 'i1', { negocioId: 'n-local', productId: 'p-negocio-local', rowSyncStatus: 'synced' });
    mockDb.seed('sync_outbox', 'o1', {
      type: 'create_negocio',
      status: 'error',
      payloadJson: JSON.stringify({
        negocio: { customer_id: 'c-outbox', codeudor_customer_id: null },
        items: [{ product_id: 'p-outbox', warehouse_id: 'w1', quantity: 1 }],
      }),
    });
    mockDb.seed('sync_outbox', 'o-hecho', {
      type: 'create_negocio',
      status: 'done',
      payloadJson: JSON.stringify({ negocio: { customer_id: 'c-fuera' }, items: [{ product_id: 'p-fuera' }] }),
    });
    for (const id of ['p-sel', 'p-fuera', 'p-negocio-local', 'p-outbox']) {
      mockDb.seed('catalog_products', id, {});
    }
    mockDb.seed('catalog_warehouse_stock', 's-sel', { productId: 'p-sel' });
    mockDb.seed('catalog_warehouse_stock', 's-sel-vieja', { productId: 'p-sel' });
    mockDb.seed('catalog_warehouse_stock', 's-fuera', { productId: 'p-fuera' });
    mockDb.seed('catalog_warehouse_stock', 's-outbox', { productId: 'p-outbox' });
  }

  function fullPayload(overrides: Partial<PullPayload> = {}) {
    return basePayload({
      full_domains_sent: ['clientes', 'productos'],
      customers: { upserts: [customer('c-sel')], deleted: [] },
      catalog_included: true,
      products: { upserts: [product('p-sel')], deleted: [] },
      warehouse_stock: {
        upserts: [{ id: 's-sel', product_id: 'p-sel', warehouse_id: 'w1', quantity: 1, updated_at: null }],
        deleted: [],
      },
      ...overrides,
    });
  }

  it('borra lo synced que no vino, salvo pendientes, rechazados y lo referenciado', async () => {
    seedPhone();

    const result = await purgeUnselectedDomains(mockDb as never, fullPayload(), { catalogApplied: true });

    expect(mockDb.ids('customers')).toEqual(
      ['c-codeudor', 'c-negocio', 'c-outbox', 'c-pendiente', 'c-rechazado', 'c-sel'].sort()
    );
    expect(mockDb.ids('catalog_products')).toEqual(['p-negocio-local', 'p-outbox', 'p-sel']);
    // Existencias: fuera las del producto borrado y la que ya no vino.
    expect(mockDb.ids('catalog_warehouse_stock')).toEqual(['s-outbox', 's-sel']);
    expect(result).toEqual({ customers: 1, products: 1, stock: 2 });
  });

  it('un paquete recortado no borra nada', async () => {
    seedPhone();

    const result = await purgeUnselectedDomains(mockDb as never, fullPayload({ truncated: true }), {
      catalogApplied: true,
    });

    expect(result).toEqual({ customers: 0, products: 0, stock: 0 });
    expect(mockDb.ids('customers')).toContain('c-fuera');
    expect(mockDb.ids('catalog_products')).toContain('p-fuera');
  });

  it('sólo poda los dominios que vinieron completos', async () => {
    seedPhone();

    await purgeUnselectedDomains(mockDb as never, fullPayload({ full_domains_sent: ['productos'] }), {
      catalogApplied: true,
    });

    expect(mockDb.ids('customers')).toContain('c-fuera');
    expect(mockDb.ids('catalog_products')).not.toContain('p-fuera');
  });

  it('productos no se poda si el catálogo no llegó en este paquete', async () => {
    seedPhone();

    await purgeUnselectedDomains(
      mockDb as never,
      fullPayload({ catalog_included: false, products: undefined }),
      { catalogApplied: false }
    );

    expect(mockDb.ids('catalog_products')).toContain('p-fuera');
    expect(mockDb.ids('customers')).not.toContain('c-fuera');
  });

  it('sin full_domains_sent (servidor antiguo) no borra nada', async () => {
    seedPhone();

    await purgeUnselectedDomains(mockDb as never, fullPayload({ full_domains_sent: undefined }), {
      catalogApplied: true,
    });

    expect(mockDb.ids('customers')).toContain('c-fuera');
  });
});

const SNAPSHOT_PAYLOAD = basePayload({
  snapshot_at: '2026-09-25T11:59:00Z',
  delivery_orders_snapshot: [
    {
      id: 'r1',
      order_number: 'OE-0010',
      order_type: 'remission',
      status: 'pending',
      customer_id: null,
      customer_name: null,
      usable: true,
      lines: [
        {
          group_kind: 'own',
          source_order_id: 'r1',
          product_id: 'p1',
          product_name: 'Mesa',
          warehouse_id: 'w1',
          warehouse_name: 'Andes',
          quantity: 7,
          available_quantity: 4,
        },
        {
          group_kind: 'child',
          source_delivery_order_id: 'k1',
          source_order_number: 'OE-0011',
          source_customer_id: 'c1',
          source_customer_name: 'Ana',
          source_has_negocio: false,
          product_id: 'p2',
          warehouse_id: 'w1',
          quantity: '2',
          available_quantity: '1',
        },
      ],
    },
    {
      id: 'oe9',
      order_number: 'OE-0009',
      order_type: 'customer',
      status: 'cancelled',
      customer_id: 'c9',
      customer_name: 'Beto',
      delivery_address: 'Vereda La Esperanza',
      usable: false,
      unusable_reason: 'La orden fue cancelada',
      lines: [],
    },
  ],
  pending_remissions: [
    { id: 'r1', order_number: 'OE-0010', status: 'pending', created_at: '2026-09-20T00:00:00Z', assigned_user_name: 'Ruta', nested_orders_count: 2 },
  ],
});

describe('foto de órdenes y remisiones', () => {
  it('guarda la foto y el repositorio la devuelve en camelCase', async () => {
    await applyOrdersSnapshot(mockDb as never, SNAPSHOT_PAYLOAD);

    const orders = await listLocalOfflineOrders();
    expect(orders.map((order) => order.id)).toEqual(['oe9', 'r1']);
    expect(orders[0]).toMatchObject({
      orderType: 'customer',
      customerName: 'Beto',
      deliveryAddress: 'Vereda La Esperanza',
      usable: false,
      unusableReason: 'La orden fue cancelada',
      snapshotAt: Date.parse('2026-09-25T11:59:00Z'),
    });
    expect(await localOrdersSnapshotAt()).toBe(Date.parse('2026-09-25T11:59:00Z'));

    const lines = await getLocalOfflineOrderLines('r1');
    expect(lines).toEqual([
      expect.objectContaining({
        orderId: 'r1',
        groupKind: 'own',
        sourceOrderId: 'r1',
        productName: 'Mesa',
        warehouseName: 'Andes',
        quantity: 7,
        availableQuantity: 4,
      }),
      expect.objectContaining({
        orderId: 'r1',
        groupKind: 'child',
        productName: 'Producto',
        warehouseName: 'Bodega',
        sourceOrderId: 'k1',
        sourceCustomerName: 'Ana',
        sourceHasNegocio: false,
        quantity: 2,
        availableQuantity: 1,
      }),
    ]);

    expect(await listLocalPendingRemissions()).toEqual([
      {
        id: 'r1',
        orderNumber: 'OE-0010',
        status: 'pending',
        createdAt: '2026-09-20T00:00:00Z',
        assignedToUserId: null,
        assignedUserName: 'Ruta',
        nestedOrdersCount: 2,
      },
    ]);
  });

  it('cada pull que la trae la reemplaza entera', async () => {
    await applyOrdersSnapshot(mockDb as never, SNAPSHOT_PAYLOAD);

    await applyOrdersSnapshot(
      mockDb as never,
      basePayload({
        server_time: '2026-09-25T13:00:00Z',
        delivery_orders_snapshot: [
          {
            id: 'r1',
            order_number: 'OE-0010',
            order_type: 'remission',
            status: 'sent_by_remission',
            customer_id: null,
            customer_name: null,
            usable: true,
            lines: [{ group_kind: 'own', product_id: 'p1', warehouse_id: 'w1', quantity: 7, available_quantity: 1 }],
          },
        ],
        pending_remissions: [],
      })
    );

    expect(mockDb.ids('delivery_orders_local')).toEqual(['r1']);
    expect(mockDb.ids('delivery_order_lines')).toEqual(['r1:0']);
    expect((await getLocalOfflineOrderLines('r1'))[0].availableQuantity).toBe(1);
    expect(await listLocalPendingRemissions()).toEqual([]);
    expect(await localOrdersSnapshotAt()).toBe(Date.parse('2026-09-25T13:00:00Z'));
  });

  it('un paquete sin las claves nuevas deja la foto anterior', async () => {
    await applyOrdersSnapshot(mockDb as never, SNAPSHOT_PAYLOAD);

    const result = await applyOrdersSnapshot(mockDb as never, basePayload());

    expect(result).toEqual({ orders: false, remissions: false });
    expect(mockDb.ids('delivery_orders_local')).toEqual(['oe9', 'r1']);
  });

  it('al recaudador puro se le borra lo que quedó de otro rol', async () => {
    await applyOrdersSnapshot(mockDb as never, SNAPSHOT_PAYLOAD);

    await applyOrdersSnapshot(mockDb as never, basePayload({ pull_scope: 'cobro' }));

    expect(mockDb.ids('delivery_orders_local')).toEqual([]);
    expect(mockDb.ids('delivery_order_lines')).toEqual([]);
    expect(mockDb.ids('pending_remissions')).toEqual([]);
  });
});

describe('pendingLocalQuantitiesByOrigin', () => {
  it('suma lo que toman los negocios de este teléfono aún no enviados, por origen', async () => {
    const command = (id: string, status: string, negocio: Record<string, unknown>, items: Row[]) =>
      mockDb.seed('sync_outbox', id, {
        type: 'create_negocio',
        status,
        payloadJson: JSON.stringify({ negocio, items }),
      });
    command('a', 'pending', { source_delivery_order_id: 'r1', remission_id: 'r1' }, [
      { product_id: 'p1', warehouse_id: 'w1', quantity: 2 },
      { product_id: 'p2', warehouse_id: 'w1', quantity: 1 },
    ]);
    command('b', 'error', { source_delivery_order_id: 'r1' }, [{ product_id: 'p1', warehouse_id: 'w1', quantity: 1 }]);
    command('c', 'syncing', { source_delivery_order_id: 'k1' }, [{ product_id: 'p2', warehouse_id: 'w1', quantity: 1 }]);
    // Rechazado o ya confirmado: ya no resta nada.
    command('d', 'failed', { source_delivery_order_id: 'r1' }, [{ product_id: 'p1', warehouse_id: 'w1', quantity: 5 }]);
    command('e', 'done', { source_delivery_order_id: 'r1' }, [{ product_id: 'p1', warehouse_id: 'w1', quantity: 5 }]);
    // Negocio de bodega (sin origen) y otro tipo de comando: no cuentan.
    command('f', 'pending', { source_delivery_order_id: null }, [{ product_id: 'p1', warehouse_id: 'w1', quantity: 9 }]);
    mockDb.seed('sync_outbox', 'g', { type: 'register_pago', status: 'pending', payloadJson: '{}' });

    const totals = await pendingLocalQuantitiesByOrigin();

    expect(Object.fromEntries(totals)).toEqual({
      'r1:p1:w1': 3,
      'r1:p2:w1': 1,
      'k1:p2:w1': 1,
    });
  });
});

describe('errores definitivos del origen del negocio', () => {
  it.each([
    'La orden de entrega está cancelada',
    'La orden de cliente ya está vinculada a un negocio',
    'La orden de entrega de origen no existe',
    'La remisión de destino no existe o no es válida',
    'Solo se puede enviar el negocio en una remisión pendiente',
    'Un negocio con origen en una orden de entrega no puede además enviarse en una remisión',
    'El cliente del negocio debe coincidir con el de la orden de entrega',
    'La orden no cuenta con suficiente cantidad para "Mesa". Disponible: 1, solicitado: 2.',
    'Saldo insuficiente de Mesa en la remisión OE-0010. Disponible: 0, solicitado: 1.',
  ])('«%s» es rechazo definitivo', (message) => {
    expect(isDefinitiveOriginError(message)).toBe(true);
    expect(classifyPushError(message)).toBe('fail');
  });

  it('no confunde errores de red ni transitorios', () => {
    expect(classifyPushError('Failed to fetch')).toBe('network');
    expect(isDefinitiveOriginError('deadlock detected')).toBe(false);
    expect(classifyPushError('deadlock detected')).toBe('retry');
    expect(isDefinitiveOriginError('El cliente no existe o fue eliminado')).toBe(false);
  });
});

describe('el motor sólo descarga cuando la persona pulsa «Descargar»', () => {
  const rpc = supabase.rpc as jest.Mock;

  beforeEach(() => {
    rpc.mockReset();
    useSyncStore.setState({ userId: 'u1', lastSyncedAt: null, lastError: null });
  });

  it.each(['foreground', 'reconnect', 'mutation', 'retry'] as const)(
    '«%s» sólo sube la cola: no llama a pull_mobile_sync',
    async (reason) => {
      await runSync(reason);

      expect(rpc).not.toHaveBeenCalled();
      expect(useSyncStore.getState().lastSyncedAt).toBeNull();
      expect(await lastManualDownloadAt()).toBeNull();
    }
  );

  it('«manual» descarga con p_options, catálogo y deja el teléfono sólo con lo elegido', async () => {
    mockDb.seed('customers', 'c-viejo', { rowSyncStatus: 'synced' });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'pull_mobile_scope') return { data: [], error: null };
      return {
        data: basePayload({
          customers: { upserts: [customer('c-sel')], deleted: [] },
          full_domains_sent: ['clientes'],
          sync_config: { clientes: { mode: 'seleccion', revision: 5 }, productos: { mode: 'todo', revision: 1 } },
          pending_remissions: [],
          delivery_orders_snapshot: [],
        }),
        error: null,
      };
    });

    await runSync('manual');

    expect(rpc.mock.calls[0][0]).toBe('pull_mobile_sync');
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_last_pulled_at: null,
      p_include_catalog: true,
      p_options: { full_domains: ['clientes'], orders: true },
    });
    expect(mockDb.ids('customers')).toEqual(['c-sel']);
    expect(await lastManualDownloadAt()).toEqual(expect.any(Number));
    expect(await isSelectiveSyncSupported()).toBe(true);
    expect(await readAppliedRevisions(mockDb as never)).toEqual({ clientes: 5, productos: null });
    expect(useSyncStore.getState().lastSyncedAt).toEqual(expect.any(Number));
  });

  it('con productos en «ninguno» borra el catálogo y no lo vuelve a pedir', async () => {
    mockDb.seed('catalog_products', 'p1', {});
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'pull_mobile_scope') return { data: [], error: null };
      return {
        data: basePayload({
          sync_config: { clientes: { mode: 'todo', revision: 1 }, productos: { mode: 'ninguno', revision: 2 } },
        }),
        error: null,
      };
    });

    await runSync('manual');
    expect(mockDb.ids('catalog_products')).toEqual([]);

    rpc.mockClear();
    await runSync('manual');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_include_catalog');
  });
});
