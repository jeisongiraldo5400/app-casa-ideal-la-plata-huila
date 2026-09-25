import { applyCatalogPayload, pruneOutOfScopeNegocios } from '../applyPull';
import {
  CATALOG_REFRESH_MS,
  clearCatalogRequest,
  requestCatalogOnNextSync,
  isCatalogRequested,
  shouldIncludeCatalog,
  mustRerunAfterInFlight,
} from '../catalogPull';
import { filterCatalogProducts, stockRowsForProduct } from '../../domain/catalogLocal';
import type { PullPayload } from '../types';

/**
 * El catálogo de producto pesa ~1,4 MB: se baja cuando hace falta, no en cada
 * sincronización. Y lo que baja son «las existencias de la última descarga».
 */

const HOY = Date.UTC(2026, 8, 23, 12, 0, 0);

describe('cuándo viaja el catálogo', () => {
  afterEach(() => clearCatalogRequest());

  it('no viaja en una sincronización cualquiera si nunca se bajó', () => {
    expect(
      shouldIncludeCatalog({ reason: 'foreground', requested: false, lastCatalogAt: null, now: HOY })
    ).toBe(false);
    expect(
      shouldIncludeCatalog({ reason: 'reconnect', requested: false, lastCatalogAt: null, now: HOY })
    ).toBe(false);
  });

  it('viaja cuando la persona pulsa «Descargar información»', () => {
    expect(
      shouldIncludeCatalog({ reason: 'manual', requested: false, lastCatalogAt: null, now: HOY })
    ).toBe(true);
  });

  it('viaja cuando lo pide una pantalla (el asistente de negocio)', () => {
    requestCatalogOnNextSync();
    expect(isCatalogRequested()).toBe(true);
    expect(
      shouldIncludeCatalog({
        reason: 'mutation',
        requested: isCatalogRequested(),
        lastCatalogAt: HOY,
        now: HOY,
      })
    ).toBe(true);
  });

  it('se refresca solo una vez al día cuando ya está descargado', () => {
    const casiUnDia = HOY - CATALOG_REFRESH_MS + 1000;
    expect(
      shouldIncludeCatalog({ reason: 'foreground', requested: false, lastCatalogAt: casiUnDia, now: HOY })
    ).toBe(false);
    expect(
      shouldIncludeCatalog({
        reason: 'foreground',
        requested: false,
        lastCatalogAt: HOY - CATALOG_REFRESH_MS,
        now: HOY,
      })
    ).toBe(true);
  });
});

type FakeRecord = Record<string, any>;

function fakeDatabase(initial: FakeRecord[] = []) {
  const rows: FakeRecord[] = [...initial];
  const decorate = (record: FakeRecord) => {
    record.prepareUpdate = (fn: (row: FakeRecord) => void) => {
      fn(record);
      return record;
    };
    record.prepareDestroyPermanently = () => {
      const index = rows.indexOf(record);
      if (index >= 0) rows.splice(index, 1);
      return record;
    };
    return record;
  };
  rows.forEach(decorate);
  const matches = (record: FakeRecord, conditions: any[]) =>
    conditions.every((condition) => {
      const [column, expected] = condition as [string, unknown];
      const camel = column.replace(/_([a-z])/g, (_m, letter: string) => letter.toUpperCase());
      const actual = record[camel] !== undefined ? record[camel] : record[column];
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    });
  return {
    get: (table: string) => ({
      find: async (id: string) => {
        const found = rows.find((row) => row.__table === table && row.id === id);
        if (!found) throw new Error('not found');
        return found;
      },
      prepareCreate: (fill: (record: FakeRecord) => void) => {
        const record: FakeRecord = { _raw: { id: '' }, __table: table };
        fill(record);
        record.id = record._raw.id;
        rows.push(decorate(record));
        return record;
      },
      query: (...conditions: any[]) => ({
        fetch: async () => rows.filter((row) => row.__table === table && matches(row, conditions)),
      }),
    }),
    write: async (fn: () => Promise<unknown>) => fn(),
    batch: async () => undefined,
    __rows: rows,
  };
}

function catalogPayload(overrides: Partial<PullPayload> = {}): PullPayload {
  const empty = { upserts: [], deleted: [] };
  return {
    server_time: '2026-09-23T12:00:00Z',
    must_wipe: false,
    truncated: false,
    roles: [],
    customers: empty,
    negocios: empty,
    negocio_cuotas: empty,
    negocio_pagos: empty,
    collection_routes: empty,
    collection_route_stops: empty,
    municipios: empty,
    catalog_included: true,
    products: {
      upserts: [
        {
          id: 'p1',
          sku: 'SKU-1',
          barcode: '7700001',
          name: 'Nevera Panorámica',
          category_id: null,
          brand_id: null,
          status: true,
          updated_at: '2026-09-23T11:00:00Z',
        },
      ],
      deleted: [],
    },
    warehouses: {
      upserts: [{ id: 'w1', name: 'Bodega Andes', city: 'Andes', is_active: true }],
      deleted: [],
    },
    warehouse_stock: {
      upserts: [
        { id: 's1', product_id: 'p1', warehouse_id: 'w1', quantity: 4, updated_at: null },
      ],
      deleted: [],
    },
    ...overrides,
  } as PullPayload;
}

describe('guardar el catálogo', () => {
  it('guarda productos, bodegas y existencias cuando el paquete los trae', async () => {
    const database = fakeDatabase();

    const applied = await applyCatalogPayload(database as never, catalogPayload());

    expect(applied).toBe(true);
    expect(database.__rows.filter((row) => row.__table === 'catalog_products')).toHaveLength(1);
    expect(database.__rows.filter((row) => row.__table === 'catalog_warehouses')).toHaveLength(1);
    expect(database.__rows.filter((row) => row.__table === 'catalog_warehouse_stock')[0]).toMatchObject({
      productId: 'p1',
      warehouseId: 'w1',
      quantity: 4,
    });
  });

  it('un paquete sin catálogo no cuenta como descarga (el cursor no avanza)', async () => {
    const database = fakeDatabase();

    const applied = await applyCatalogPayload(
      database as never,
      catalogPayload({ catalog_included: false, products: undefined })
    );

    expect(applied).toBe(false);
    expect(database.__rows).toHaveLength(0);
  });

  it('un producto retirado se lleva sus existencias', async () => {
    const database = fakeDatabase([
      { __table: 'catalog_products', id: 'p1', name: 'Nevera' },
      { __table: 'catalog_warehouse_stock', id: 's1', productId: 'p1', quantity: 4 },
    ]);

    await applyCatalogPayload(
      database as never,
      // El servidor no manda existencias de un producto retirado.
      catalogPayload({
        products: { upserts: [], deleted: ['p1'] },
        warehouse_stock: { upserts: [], deleted: [] },
      })
    );

    expect(database.__rows.filter((row) => row.__table === 'catalog_products')).toHaveLength(0);
    expect(database.__rows.filter((row) => row.__table === 'catalog_warehouse_stock')).toHaveLength(0);
  });
});

describe('la poda no borra un negocio creado sin señal', () => {
  it('conserva el pendiente y el rechazado aunque no estén en el alcance', async () => {
    const database = fakeDatabase([
      { __table: 'negocios', id: 'pendiente', rowSyncStatus: 'pending', negocioId: 'pendiente' },
      { __table: 'negocios', id: 'rechazado', rowSyncStatus: 'rejected', negocioId: 'rechazado' },
      { __table: 'negocios', id: 'ajeno', rowSyncStatus: 'synced', negocioId: 'ajeno' },
    ]);

    const removed = await pruneOutOfScopeNegocios(database as never, []);

    expect(removed).toBe(1);
    expect(database.__rows.map((row) => row.id)).toEqual(['pendiente', 'rechazado']);
  });
});

describe('buscar en el catálogo descargado', () => {
  const productos = [
    { id: 'p1', name: 'Nevera Panorámica', sku: 'NEV-1', barcode: '7700001', status: true },
    { id: 'p2', name: 'Estufa', sku: 'EST-2', barcode: '7700002', status: true },
    { id: 'p3', name: 'Nevera vieja', sku: 'NEV-0', barcode: '7700003', status: false },
  ];

  it('encuentra sin tildes y no ofrece productos desactivados', () => {
    const found = filterCatalogProducts(productos, 'panoramica');
    expect(found.map((row) => row.id)).toEqual(['p1']);
    expect(filterCatalogProducts(productos, 'nevera').map((row) => row.id)).toEqual(['p1']);
  });

  it('encuentra por código de barras y no devuelve nada sin término', () => {
    expect(filterCatalogProducts(productos, '7700002').map((row) => row.id)).toEqual(['p2']);
    expect(filterCatalogProducts(productos, '')).toEqual([]);
  });

  it('las existencias salen por bodega, de mayor a menor y sin ceros', () => {
    const rows = stockRowsForProduct(
      [
        { productId: 'p1', warehouseId: 'w1', quantity: 2 },
        { productId: 'p1', warehouseId: 'w2', quantity: 9 },
        { productId: 'p1', warehouseId: 'w3', quantity: 0 },
        { productId: 'p2', warehouseId: 'w1', quantity: 5 },
      ],
      new Map([
        ['w1', 'Bodega Andes'],
        ['w2', 'Bodega Centro'],
      ]),
      'p1'
    );

    expect(rows).toEqual([
      { warehouse_id: 'w2', warehouse_name: 'Bodega Centro', quantity: 9 },
      { warehouse_id: 'w1', warehouse_name: 'Bodega Andes', quantity: 2 },
    ]);
  });
});

describe('mustRerunAfterInFlight', () => {
  it('«Descargar información» durante una sincronización automática vuelve a sincronizar (con catálogo)', () => {
    expect(
      mustRerunAfterInFlight({
        inFlight: { reason: 'reconnect', catalogRequested: false },
        reason: 'manual',
        catalogRequested: false,
      })
    ).toBe(true);
  });

  it('el asistente que pide catálogo a mitad de una automática no se pierde', () => {
    expect(
      mustRerunAfterInFlight({
        inFlight: { reason: 'foreground', catalogRequested: false },
        reason: 'mutation',
        catalogRequested: true,
      })
    ).toBe(true);
  });

  it('si la que corre ya es manual o ya llevaba el catálogo, basta con esperarla', () => {
    expect(
      mustRerunAfterInFlight({
        inFlight: { reason: 'manual', catalogRequested: false },
        reason: 'manual',
        catalogRequested: true,
      })
    ).toBe(false);
    expect(
      mustRerunAfterInFlight({
        inFlight: { reason: 'mutation', catalogRequested: true },
        reason: 'mutation',
        catalogRequested: true,
      })
    ).toBe(false);
    expect(
      mustRerunAfterInFlight({
        inFlight: { reason: 'foreground', catalogRequested: false },
        reason: 'mutation',
        catalogRequested: false,
      })
    ).toBe(false);
  });
});
