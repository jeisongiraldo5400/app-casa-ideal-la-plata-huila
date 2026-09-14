import { migrations, PRONTO_PAGO_PAGO_COLUMNS } from '../migrations';
import { schema } from '../schema';
import { pullCursorForPayloadVersion, PULL_PAYLOAD_VERSION } from '../sync/types';

type AddColumnsStep = { type: string; table: string; columns: { name: string; type: string; isOptional?: boolean }[] };

describe('esquema local v6 (pronto pago)', () => {
  it('el esquema y las migraciones llegan a la misma versión', () => {
    expect(schema.version).toBe(6);
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

  it('una instalación nueva crea las mismas columnas que agrega la migración', () => {
    // En jest `appSchema`/`tableSchema` están simulados como identidad: `tables`
    // es la lista declarada en schema.ts.
    const tables = schema.tables as unknown as { name: string; columns: { name: string }[] }[];
    const pagos = tables.find((table) => table.name === 'negocio_pagos');
    expect(pagos).toBeDefined();
    for (const column of PRONTO_PAGO_PAGO_COLUMNS) {
      expect(pagos!.columns.find((candidate) => candidate.name === column.name)).toEqual(column);
    }
  });
});

describe('pullCursorForPayloadVersion', () => {
  it('conserva el cursor delta si la versión guardada es la actual', () => {
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', PULL_PAYLOAD_VERSION)).toBe('2026-09-10T00:00:00Z');
  });

  it('fuerza una descarga completa tras actualizar la app (versión ausente o anterior)', () => {
    expect(PULL_PAYLOAD_VERSION).toBe('6');
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', null)).toBeNull();
    expect(pullCursorForPayloadVersion('2026-09-10T00:00:00Z', '5')).toBeNull();
  });
});
