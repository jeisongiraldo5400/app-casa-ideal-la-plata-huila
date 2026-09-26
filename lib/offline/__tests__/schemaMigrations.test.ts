import {
  CUSTOMER_DIRECTORY_COLUMNS,
  migrations,
  NEGOCIO_LOCATION_COLUMNS,
  NEGOCIO_NAME_COLUMNS,
  PRONTO_PAGO_PAGO_COLUMNS,
  REJECTED_PAGO_COLUMNS,
} from '../migrations';
import { schema } from '../schema';
import { pullCursorForPayloadVersion, PULL_PAYLOAD_VERSION } from '../sync/types';

type AddColumnsStep = { type: string; table: string; columns: { name: string; type: string; isOptional?: boolean }[] };

describe('esquema local (pronto pago v6, pago rechazado v7)', () => {
  it('el esquema y las migraciones llegan a la misma versión', () => {
    // La versión sube con cada cambio del esquema local; lo que no puede fallar
    // es que migraciones y esquema queden a la par y sin huecos desde la v1.
    expect(schema.version).toBeGreaterThanOrEqual(7);
    expect(migrations.maxVersion).toBe(schema.version);
    // Cubren desde la v1 sin huecos: un dispositivo en cualquier versión anterior migra.
    expect(migrations.minVersion).toBe(1);
  });

  it('la migración a 6 agrega a negocio_pagos las columnas del pronto pago, opcionales', () => {
    const toSix = migrations.sortedMigrations.find((migration) => migration.toVersion === 6);
    expect(toSix).toBeDefined();
    const steps = toSix!.steps as unknown as AddColumnsStep[];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'add_columns', table: 'negocio_pagos' });
    expect(steps[0].columns.map((column) => [column.name, column.type, column.isOptional])).toEqual([
      ['payment_kind', 'string', true],
      ['discount_amount', 'number', true],
      ['discount_reason', 'string', true],
      ['expected_total', 'number', true],
    ]);
  });

  it('la migración a 7 agrega a negocio_pagos las columnas del rechazo, opcionales', () => {
    const toSeven = migrations.sortedMigrations.find((migration) => migration.toVersion === 7);
    expect(toSeven).toBeDefined();
    const steps = toSeven!.steps as unknown as AddColumnsStep[];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'add_columns', table: 'negocio_pagos' });
    expect(steps[0].columns.map((column) => [column.name, column.type, column.isOptional])).toEqual([
      ['rejected_reason', 'string', true],
      ['rejected_at', 'number', true],
    ]);
  });

  it('una instalación nueva crea las mismas columnas que agrega la migración', () => {
    // En jest `appSchema`/`tableSchema` están simulados como identidad: `tables`
    // es la lista declarada en schema.ts.
    const tables = schema.tables as unknown as { name: string; columns: { name: string }[] }[];
    const pagos = tables.find((table) => table.name === 'negocio_pagos');
    expect(pagos).toBeDefined();
    for (const column of [...PRONTO_PAGO_PAGO_COLUMNS, ...REJECTED_PAGO_COLUMNS]) {
      expect(pagos!.columns.find((candidate) => candidate.name === column.name)).toEqual(column);
    }
  });

  it('la migración a 8 crea las tablas del pull ampliado y amplía customers y negocios', () => {
    const toEight = migrations.sortedMigrations.find((migration) => migration.toVersion === 8);
    expect(toEight).toBeDefined();
    const steps = toEight!.steps as unknown as (AddColumnsStep & { schema?: { name: string } })[];
    expect(steps.filter((step) => step.type === 'create_table').map((step) => step.schema?.name)).toEqual([
      'negocio_items',
      'catalog_veredas',
      'catalog_departamentos',
      'profiles',
      'credit_settings',
    ]);
    const added = steps.filter((step) => step.type === 'add_columns');
    expect(added.map((step) => step.table)).toEqual(['customers', 'negocios', 'catalog_municipios']);
    expect(added[0].columns).toEqual(CUSTOMER_DIRECTORY_COLUMNS);
    expect(added[1].columns).toEqual(NEGOCIO_NAME_COLUMNS);
  });

  it('una instalación nueva trae las tablas y columnas de la v8', () => {
    const tables = schema.tables as unknown as { name: string; columns: { name: string }[] }[];
    for (const name of ['negocio_items', 'catalog_veredas', 'catalog_departamentos', 'profiles', 'credit_settings']) {
      expect(tables.find((table) => table.name === name)).toBeDefined();
    }
    const customers = tables.find((table) => table.name === 'customers')!;
    for (const column of CUSTOMER_DIRECTORY_COLUMNS) {
      expect(customers.columns.find((candidate) => candidate.name === column.name)).toEqual(column);
    }
    const negocios = tables.find((table) => table.name === 'negocios')!;
    for (const column of NEGOCIO_NAME_COLUMNS) {
      expect(negocios.columns.find((candidate) => candidate.name === column.name)).toEqual(column);
    }
  });
});

describe('esquema local v12: vereda propia del negocio', () => {
  it('la migración a 12 agrega negocios.vereda_id opcional y la instalación nueva la trae', () => {
    const toTwelve = migrations.sortedMigrations.find((migration) => migration.toVersion === 12);
    expect(toTwelve).toBeDefined();
    const steps = toTwelve!.steps as unknown as AddColumnsStep[];
    expect(steps).toEqual([{ type: 'add_columns', table: 'negocios', columns: NEGOCIO_LOCATION_COLUMNS }]);
    expect(NEGOCIO_LOCATION_COLUMNS).toEqual([{ name: 'vereda_id', type: 'string', isOptional: true }]);
    const tables = schema.tables as unknown as { name: string; columns: { name: string }[] }[];
    const negocios = tables.find((table) => table.name === 'negocios')!;
    expect(negocios.columns.find((column) => column.name === 'vereda_id')).toEqual(NEGOCIO_LOCATION_COLUMNS[0]);
    expect(schema.version).toBe(12);
  });
});

describe('pullCursorForPayloadVersion', () => {
  it('conserva el cursor delta si la versión guardada es la actual', () => {
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', PULL_PAYLOAD_VERSION)).toBe('2026-09-10T00:00:00Z');
  });

  it('fuerza una descarga completa tras actualizar la app (versión ausente o anterior)', () => {
    expect(PULL_PAYLOAD_VERSION).toBe('10');
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', '9')).toBeNull();
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', null)).toBeNull();
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', '8')).toBeNull();
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', '6')).toBeNull();
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', '7')).toBeNull();
  });
});
