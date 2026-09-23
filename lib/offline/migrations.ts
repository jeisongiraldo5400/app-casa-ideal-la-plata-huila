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

/** Columnas de `negocio_pagos` añadidas en la versión 7 (también en `schema.ts`). */
export const REJECTED_PAGO_COLUMNS = [
  { name: 'rejected_reason', type: 'string' as const, isOptional: true },
  { name: 'rejected_at', type: 'number' as const, isOptional: true },
];

/** Columnas de `customers` añadidas en la versión 8 (también en `schema.ts`). */
export const CUSTOMER_DIRECTORY_COLUMNS = [
  { name: 'phone_secondary', type: 'string' as const, isOptional: true },
  { name: 'email', type: 'string' as const, isOptional: true },
  { name: 'address', type: 'string' as const, isOptional: true },
  { name: 'municipio_id', type: 'string' as const, isOptional: true },
  { name: 'vereda_id', type: 'string' as const, isOptional: true },
];

/** Columnas de `negocios` añadidas en la versión 8 (también en `schema.ts`). */
export const NEGOCIO_NAME_COLUMNS = [
  { name: 'seller_name', type: 'string' as const, isOptional: true },
  { name: 'gestor_cobro_name', type: 'string' as const, isOptional: true },
];

/** Columnas de `negocios` añadidas en la versión 9 (también en `schema.ts`). */
export const REJECTED_NEGOCIO_COLUMNS = [
  { name: 'rejected_reason', type: 'string' as const, isOptional: true },
  { name: 'rejected_at', type: 'number' as const, isOptional: true },
];

/** Tablas del catálogo de producto añadidas en la versión 9 (también en `schema.ts`). */
export const CATALOG_PRODUCT_TABLES = [
  {
    name: 'catalog_products',
    columns: [
      { name: 'name', type: 'string' as const },
      { name: 'sku', type: 'string' as const, isOptional: true },
      { name: 'barcode', type: 'string' as const, isOptional: true, isIndexed: true },
      { name: 'category_id', type: 'string' as const, isOptional: true },
      { name: 'brand_id', type: 'string' as const, isOptional: true },
      { name: 'status', type: 'boolean' as const },
      { name: 'server_updated_at', type: 'number' as const, isOptional: true },
    ],
  },
  {
    name: 'catalog_warehouses',
    columns: [
      { name: 'name', type: 'string' as const },
      { name: 'city', type: 'string' as const, isOptional: true },
      { name: 'is_active', type: 'boolean' as const },
    ],
  },
  {
    name: 'catalog_warehouse_stock',
    columns: [
      { name: 'product_id', type: 'string' as const, isIndexed: true },
      { name: 'warehouse_id', type: 'string' as const, isIndexed: true },
      { name: 'quantity', type: 'number' as const },
      { name: 'server_updated_at', type: 'number' as const, isOptional: true },
    ],
  },
];

export const migrations = schemaMigrations({
  migrations: [
    {
      // Catálogo de producto para armar un negocio sin señal, y la marca de
      // rechazo del negocio que el servidor no aceptó al subirlo.
      toVersion: 9,
      steps: [
        addColumns({ table: 'negocios', columns: REJECTED_NEGOCIO_COLUMNS }),
        ...CATALOG_PRODUCT_TABLES.map((table) => createTable(table)),
      ],
    },
    {
      // El pull trae más datos (20261122120000): perfiles, productos del
      // negocio, veredas, departamentos, configuración de crédito y el
      // directorio completo de clientes con su contacto y ubicación.
      toVersion: 8,
      steps: [
        addColumns({ table: 'customers', columns: CUSTOMER_DIRECTORY_COLUMNS }),
        addColumns({ table: 'negocios', columns: NEGOCIO_NAME_COLUMNS }),
        addColumns({
          table: 'catalog_municipios',
          columns: [{ name: 'departamento_id', type: 'string', isOptional: true }],
        }),
        createTable({
          name: 'negocio_items',
          columns: [
            { name: 'negocio_id', type: 'string', isIndexed: true },
            { name: 'product_id', type: 'string' },
            { name: 'product_name', type: 'string', isOptional: true },
            { name: 'product_sku', type: 'string', isOptional: true },
            { name: 'warehouse_id', type: 'string', isOptional: true },
            { name: 'description', type: 'string', isOptional: true },
            { name: 'quantity', type: 'number' },
            { name: 'unit_price', type: 'number' },
            { name: 'subtotal', type: 'number' },
            { name: 'sync_status', type: 'string' },
            { name: 'server_updated_at', type: 'number', isOptional: true },
          ],
        }),
        createTable({
          name: 'catalog_veredas',
          columns: [
            { name: 'nombre', type: 'string' },
            { name: 'municipio_id', type: 'string', isIndexed: true },
            { name: 'is_active', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'catalog_departamentos',
          columns: [
            { name: 'nombre', type: 'string' },
            { name: 'is_active', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'profiles',
          columns: [
            { name: 'full_name', type: 'string', isOptional: true },
            { name: 'email', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'credit_settings',
          columns: [
            { name: 'formula_type', type: 'string' },
            { name: 'interest_rate_monthly_pct', type: 'number' },
            { name: 'rounding_unit', type: 'number' },
            { name: 'late_fee_rate_pct', type: 'number' },
            { name: 'money_decimal_places', type: 'number' },
            { name: 'min_installments', type: 'number' },
            { name: 'max_installments', type: 'number' },
            { name: 'default_frequency', type: 'string' },
            { name: 'legal_text', type: 'string', isOptional: true },
            { name: 'is_active', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      // Pago rechazado por el servidor: se conserva marcado en vez de borrarse.
      toVersion: 7,
      steps: [
        addColumns({
          table: 'negocio_pagos',
          columns: REJECTED_PAGO_COLUMNS,
        }),
      ],
    },
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
