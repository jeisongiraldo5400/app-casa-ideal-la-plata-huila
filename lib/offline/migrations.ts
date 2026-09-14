import {
  addColumns,
  createTable,
  schemaMigrations,
} from '@nozbe/watermelondb/Schema/migrations';

/** Columnas de `negocio_pagos` añadidas en la versión 6 (también en `schema.ts`). */
export const PRONTO_PAGO_PAGO_COLUMNS = [
  { name: 'payment_kind', type: 'string' as const, isOptional: true },
  { name: 'discount_amount', type: 'number' as const, isOptional: true },
  { name: 'discount_reason', type: 'string' as const, isOptional: true },
  { name: 'expected_total', type: 'number' as const, isOptional: true },
];

export const migrations = schemaMigrations({
  migrations: [
    {
      // Descuento por pronto pago: tipo de pago, descuento, motivo y pendiente liquidado.
      toVersion: 6,
      steps: [
        addColumns({
          table: 'negocio_pagos',
          columns: PRONTO_PAGO_PAGO_COLUMNS,
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'negocio_pagos',
          columns: [{ name: 'payment_site', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'customers',
          columns: [{ name: 'seller_id', type: 'string', isOptional: true, isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'negocio_pagos',
          columns: [
            { name: 'payment_method_id', type: 'string', isOptional: true },
            { name: 'payment_method_name', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'catalog_payment_methods',
          columns: [{ name: 'name', type: 'string' }],
        }),
      ],
    },
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'negocio_pagos',
          columns: [{ name: 'created_by_name', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
