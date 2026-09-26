import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { OFFLINE_ORDER_TABLES } from './migrations';

export const schema = appSchema({
  version: 12,
  tables: [
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'id_number', type: 'string', isIndexed: true },
        { name: 'phone', type: 'string', isOptional: true },
        // Vendedor al que pertenece el cliente; alimenta la pestaña "Mis clientes" sin conexión.
        { name: 'seller_id', type: 'string', isOptional: true, isIndexed: true },
        // Contacto y ubicación (v8): la ficha del cliente los pintaba vacíos sin
        // señal aunque el cliente sí los tuviera guardados.
        { name: 'phone_secondary', type: 'string', isOptional: true },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'municipio_id', type: 'string', isOptional: true },
        { name: 'vereda_id', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'local_updated_at', type: 'number' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'negocios',
      columns: [
        { name: 'numero', type: 'number', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'deal_date', type: 'string', isOptional: true },
        { name: 'total_credit', type: 'number' },
        { name: 'remaining_balance', type: 'number' },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'codeudor_customer_id', type: 'string', isOptional: true },
        { name: 'direccion', type: 'string', isOptional: true },
        { name: 'municipio_id', type: 'string', isOptional: true },
        { name: 'municipio_name', type: 'string', isOptional: true },
        { name: 'seller_id', type: 'string', isOptional: true },
        { name: 'gestor_cobro_id', type: 'string', isOptional: true },
        // Nombres ya resueltos por el servidor (v8). Sin ellos el detalle decía
        // "Vendedor: Sin asignar" sin señal aunque el negocio sí tuviera uno.
        { name: 'seller_name', type: 'string', isOptional: true },
        { name: 'gestor_cobro_name', type: 'string', isOptional: true },
        // Negocio creado sin señal y rechazado por el servidor (v9): la fila NO
        // se borra, queda marcada con el motivo. `sync_status` vale 'rejected'.
        { name: 'rejected_reason', type: 'string', isOptional: true },
        { name: 'rejected_at', type: 'number', isOptional: true },
        // Quién registró el negocio (v10), con su nombre ya resuelto: el
        // contrato impreso sin señal ponía «—» en «CREADO POR».
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'created_by_name', type: 'string', isOptional: true },
        // Vereda propia del negocio (v12); puede diferir de la del cliente.
        { name: 'vereda_id', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      // Productos del negocio (v8), con nombre y SKU ya resueltos: sin señal el
      // detalle ocultaba la sección entera.
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
    tableSchema({
      name: 'negocio_cuotas',
      columns: [
        { name: 'negocio_id', type: 'string', isIndexed: true },
        { name: 'installment_number', type: 'number' },
        { name: 'due_date', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'paid_amount', type: 'number' },
        { name: 'late_fee_amount', type: 'number' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'sync_status', type: 'string' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'negocio_pagos',
      columns: [
        { name: 'negocio_id', type: 'string', isIndexed: true },
        { name: 'cuota_id', type: 'string', isOptional: true },
        { name: 'amount', type: 'number' },
        { name: 'paid_at', type: 'string' },
        { name: 'receipt_number', type: 'string', isOptional: true },
        { name: 'virtual_receipt_number', type: 'string', isOptional: true },
        { name: 'receipt_status', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_by_name', type: 'string', isOptional: true },
        { name: 'payment_method_id', type: 'string', isOptional: true },
        { name: 'payment_method_name', type: 'string', isOptional: true },
        { name: 'payment_site', type: 'string', isOptional: true },
        // Pronto pago (v6): 'abono' | 'pronto_pago'; `amount` sigue siendo dinero recibido.
        { name: 'payment_kind', type: 'string', isOptional: true },
        { name: 'discount_amount', type: 'number', isOptional: true },
        { name: 'discount_reason', type: 'string', isOptional: true },
        { name: 'expected_total', type: 'number', isOptional: true },
        // Rechazo del servidor (v7): el pago NO se borra del teléfono, queda
        // marcado con el motivo para que la persona decida qué hacer con el
        // recibo que ya entregó. `sync_status` toma el valor 'rejected'.
        { name: 'rejected_reason', type: 'string', isOptional: true },
        { name: 'rejected_at', type: 'number', isOptional: true },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'collection_routes',
      columns: [
        { name: 'gestor_id', type: 'string', isIndexed: true },
        { name: 'route_date', type: 'string' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'started_at', type: 'string', isOptional: true },
        { name: 'completed_at', type: 'string', isOptional: true },
        { name: 'total_expected', type: 'number' },
        { name: 'total_collected', type: 'number' },
        { name: 'sync_status', type: 'string' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'collection_route_stops',
      columns: [
        { name: 'route_id', type: 'string', isIndexed: true },
        { name: 'negocio_id', type: 'string', isIndexed: true },
        { name: 'negocio_numero', type: 'number' },
        { name: 'position', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'customer_name', type: 'string' },
        { name: 'customer_phone', type: 'string', isOptional: true },
        { name: 'customer_address', type: 'string' },
        { name: 'municipality_name', type: 'string', isOptional: true },
        { name: 'expected_balance', type: 'number' },
        { name: 'payment_id', type: 'string', isOptional: true },
        { name: 'payment_amount', type: 'number', isOptional: true },
        { name: 'outcome_reason', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'arrived_at', type: 'string', isOptional: true },
        { name: 'completed_at', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'catalog_municipios',
      columns: [
        { name: 'nombre', type: 'string' },
        { name: 'is_active', type: 'boolean' },
        // Departamento del municipio (v8): completa la ubicación de la ficha.
        { name: 'departamento_id', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      // Veredas (v8): la ficha del cliente muestra «dirección, vereda, municipio».
      name: 'catalog_veredas',
      columns: [
        { name: 'nombre', type: 'string' },
        { name: 'municipio_id', type: 'string', isIndexed: true },
        { name: 'is_active', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'catalog_departamentos',
      columns: [
        { name: 'nombre', type: 'string' },
        { name: 'is_active', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'catalog_payment_methods',
      columns: [{ name: 'name', type: 'string' }],
    }),
    tableSchema({
      // Catálogo de producto (v9). Se baja aparte, bajo demanda: son ~2.100
      // productos y ~3.400 existencias (~1,4 MB) y sólo lo usa el asistente de
      // negocio sin señal.
      name: 'catalog_products',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'sku', type: 'string', isOptional: true },
        { name: 'barcode', type: 'string', isOptional: true, isIndexed: true },
        { name: 'category_id', type: 'string', isOptional: true },
        { name: 'brand_id', type: 'string', isOptional: true },
        { name: 'status', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'catalog_warehouses',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'city', type: 'string', isOptional: true },
        { name: 'is_active', type: 'boolean' },
      ],
    }),
    tableSchema({
      // Existencias de la última descarga: nunca son el stock de ahora mismo,
      // y la pantalla lo dice así.
      name: 'catalog_warehouse_stock',
      columns: [
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'warehouse_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      // Usuarios activos (v8). Resuelve nombres de vendedor/gestor y alimenta
      // los filtros por vendedor, que sin red salían vacíos.
      name: 'profiles',
      columns: [
        { name: 'full_name', type: 'string', isOptional: true },
        { name: 'email', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      // Fila activa de configuración de crédito (v8): decimales del dinero y
      // texto legal para los recibos sin señal.
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
    tableSchema({
      name: 'user_profile_cache',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'roles_json', type: 'string' },
        { name: 'cached_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'report_snapshots',
      columns: [
        { name: 'kind', type: 'string', isIndexed: true },
        { name: 'payload_json', type: 'string' },
        { name: 'pulled_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sync_outbox',
      columns: [
        { name: 'type', type: 'string', isIndexed: true },
        { name: 'payload_json', type: 'string' },
        { name: 'idempotency_key', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'attempts', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'next_retry_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'result_json', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'sync_meta',
      columns: [
        { name: 'key', type: 'string', isIndexed: true },
        { name: 'value', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'file_uploads',
      columns: [
        { name: 'local_uri', type: 'string' },
        { name: 'mime', type: 'string' },
        { name: 'file_name', type: 'string' },
        { name: 'bucket', type: 'string' },
        { name: 'negocio_id', type: 'string', isOptional: true },
        { name: 'pago_local_id', type: 'string', isOptional: true },
        { name: 'pago_server_id', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'last_error', type: 'string', isOptional: true },
      ],
    }),
    // Órdenes llevadas en el teléfono y remisiones pendientes (v11): foto que
    // el servidor recalcula entera en cada descarga. Ver `ordersSnapshot.ts`.
    ...OFFLINE_ORDER_TABLES.map((table) => tableSchema(table)),
  ],
});
