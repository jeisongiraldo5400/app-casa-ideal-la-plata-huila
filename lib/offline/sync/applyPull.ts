import { Q } from '@nozbe/watermelondb';
import type { Database, Model } from '@nozbe/watermelondb';
import type { PullPayload } from './types';
import { REJECTED_ROW_SYNC_STATUS, toEpoch } from './types';
import {
  CatalogDepartamento,
  CatalogMunicipio,
  CatalogPaymentMethod,
  CatalogProduct,
  CatalogVereda,
  CatalogWarehouse,
  CatalogWarehouseStock,
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  CreditSettingsRecord,
  Customer,
  Negocio,
  NegocioCuota,
  NegocioItem,
  NegocioPago,
  Profile,
  SyncOutboxItem,
  UserProfileCache,
} from '../models';
import { fullDomainsSent } from './syncPrefs';

type SyncAware = Model & { rowSyncStatus?: string };

/**
 * Upsert por id. Una fila local en `pending` tiene un cambio optimista que el
 * servidor todavía no conoce: no se pisa. Cuando el comando confirme, la fila
 * vuelve a `synced` y el servidor la habrá modificado (updated_at), así que el
 * siguiente pull la traerá; si el comando falla, el rollback la restaura.
 */
async function upsertById<T extends SyncAware>(
  database: Database,
  table: string,
  id: string,
  prepare: (record: T) => void
): Promise<Model | null> {
  const collection = database.get<T>(table);
  try {
    const existing = await collection.find(id);
    if (existing.rowSyncStatus === 'pending') return null;
    return existing.prepareUpdate(prepare);
  } catch {
    return collection.prepareCreate((record) => {
      record._raw.id = id;
      prepare(record);
    });
  }
}

async function destroyIfExists(database: Database, table: string, id: string) {
  try {
    const record = await database.get(table).find(id);
    return record.prepareDestroyPermanently();
  } catch {
    return null;
  }
}

function push(operations: Model[], op: Model | null) {
  if (op) operations.push(op);
}

export async function applyPullPayload(database: Database, payload: PullPayload, userId: string) {
  const operations: Model[] = [];

  for (const row of payload.customers.upserts) {
    push(
      operations,
      await upsertById<Customer>(database, 'customers', row.id, (record) => {
        record.name = row.name;
        record.idNumber = row.id_number;
        record.phone = row.phone;
        record.sellerId = row.seller_id ?? null;
        record.phoneSecondary = row.phone_secondary ?? null;
        record.email = row.email ?? null;
        record.address = row.address ?? null;
        record.municipioId = row.municipio_id ?? null;
        record.veredaId = row.vereda_id ?? null;
        record.rowSyncStatus = 'synced';
        record.localUpdatedAt = Date.now();
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.customers.deleted) {
    push(operations, await destroyIfExists(database, 'customers', id));
  }

  for (const row of payload.negocios.upserts) {
    push(
      operations,
      await upsertById<Negocio>(database, 'negocios', row.id, (record) => {
        record.numero = Number(row.numero || 0);
        record.status = row.status;
        record.dealDate = row.deal_date;
        record.totalCredit = Number(row.total_credit || 0);
        record.remainingBalance = Number(row.remaining_balance || 0);
        record.customerId = row.customer_id;
        record.codeudorCustomerId = row.codeudor_customer_id;
        record.direccion = row.direccion;
        record.municipioId = row.municipio_id;
        record.municipioName = row.municipio_name;
        record.sellerId = row.seller_id;
        record.gestorCobroId = row.gestor_cobro_id;
        record.sellerName = row.seller_name ?? null;
        record.gestorCobroName = row.gestor_cobro_name ?? null;
        record.createdBy = row.created_by ?? null;
        record.createdByName = row.created_by_name ?? null;
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.negocios.deleted) {
    push(operations, await destroyIfExists(database, 'negocios', id));
  }

  for (const row of payload.negocio_items?.upserts || []) {
    push(
      operations,
      await upsertById<NegocioItem>(database, 'negocio_items', row.id, (record) => {
        record.negocioId = row.negocio_id;
        record.productId = row.product_id;
        record.productName = row.product_name ?? null;
        record.productSku = row.product_sku ?? null;
        record.warehouseId = row.warehouse_id ?? null;
        record.description = row.description ?? null;
        record.quantity = Number(row.quantity || 0);
        record.unitPrice = Number(row.unit_price || 0);
        record.subtotal = Number(row.subtotal || 0);
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.negocio_items?.deleted || []) {
    push(operations, await destroyIfExists(database, 'negocio_items', id));
  }

  for (const row of payload.negocio_cuotas.upserts) {
    push(
      operations,
      await upsertById<NegocioCuota>(database, 'negocio_cuotas', row.id, (record) => {
        record.negocioId = row.negocio_id;
        record.installmentNumber = Number(row.installment_number || 0);
        record.dueDate = row.due_date;
        record.amount = Number(row.amount || 0);
        record.paidAmount = Number(row.paid_amount || 0);
        record.lateFeeAmount = Number(row.late_fee_amount || 0);
        record.status = row.status;
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.negocio_cuotas.deleted) {
    push(operations, await destroyIfExists(database, 'negocio_cuotas', id));
  }

  for (const row of payload.negocio_pagos.upserts) {
    push(
      operations,
      await upsertById<NegocioPago>(database, 'negocio_pagos', row.id, (record) => {
        record.negocioId = row.negocio_id;
        record.cuotaId = row.cuota_id;
        record.amount = Number(row.amount || 0);
        record.paidAt = row.paid_at;
        record.receiptNumber = row.receipt_number;
        record.virtualReceiptNumber = row.virtual_receipt_number;
        record.receiptStatus = row.receipt_status || 'emitido';
        record.notes = row.notes;
        record.createdByName = row.created_by_name ?? null;
        record.paymentMethodId = row.payment_method_id ?? null;
        record.paymentMethodName = row.payment_method_name ?? null;
        record.paymentSite = row.payment_site ?? null;
        record.paymentKind = row.payment_kind ?? null;
        record.discountAmount = row.discount_amount == null ? null : Number(row.discount_amount);
        record.discountReason = row.discount_reason ?? null;
        record.expectedTotal = row.expected_total == null ? null : Number(row.expected_total);
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.created_at);
      })
    );
  }
  for (const id of payload.negocio_pagos.deleted) {
    push(operations, await destroyIfExists(database, 'negocio_pagos', id));
  }

  for (const row of payload.collection_routes.upserts) {
    push(
      operations,
      await upsertById<CollectionRouteRecord>(database, 'collection_routes', row.id, (record) => {
        record.gestorId = row.gestor_id;
        record.routeDate = row.route_date;
        record.status = row.status;
        record.startedAt = row.started_at;
        record.completedAt = row.completed_at;
        record.totalExpected = Number(row.total_expected || 0);
        record.totalCollected = Number(row.total_collected || 0);
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.collection_routes.deleted) {
    push(operations, await destroyIfExists(database, 'collection_routes', id));
  }

  for (const row of payload.collection_route_stops.upserts) {
    push(
      operations,
      await upsertById<CollectionRouteStopRecord>(database, 'collection_route_stops', row.id, (record) => {
        record.routeId = row.route_id;
        record.negocioId = row.negocio_id;
        record.negocioNumero = Number(row.negocio_numero || 0);
        record.position = Number(row.position || 0);
        record.status = row.status;
        record.customerName = row.customer_name;
        record.customerPhone = row.customer_phone;
        record.customerAddress = row.customer_address;
        record.municipalityName = row.municipality_name;
        record.expectedBalance = Number(row.expected_balance || 0);
        record.paymentId = row.payment_id;
        record.paymentAmount = row.payment_amount == null ? null : Number(row.payment_amount);
        record.outcomeReason = row.outcome_reason;
        record.notes = row.notes;
        record.arrivedAt = row.arrived_at;
        record.completedAt = row.completed_at;
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.collection_route_stops.deleted) {
    push(operations, await destroyIfExists(database, 'collection_route_stops', id));
  }

  for (const row of payload.municipios.upserts) {
    push(
      operations,
      await upsertById<CatalogMunicipio>(database, 'catalog_municipios', row.id, (record) => {
        record.nombre = row.nombre;
        record.isActive = Boolean(row.is_active);
        record.departamentoId = row.departamento_id ?? null;
      })
    );
  }

  for (const row of payload.veredas?.upserts || []) {
    push(
      operations,
      await upsertById<CatalogVereda>(database, 'catalog_veredas', row.id, (record) => {
        record.nombre = row.nombre;
        record.municipioId = row.municipio_id;
        record.isActive = Boolean(row.is_active);
      })
    );
  }
  for (const id of payload.veredas?.deleted || []) {
    push(operations, await destroyIfExists(database, 'catalog_veredas', id));
  }

  for (const row of payload.departamentos?.upserts || []) {
    push(
      operations,
      await upsertById<CatalogDepartamento>(database, 'catalog_departamentos', row.id, (record) => {
        record.nombre = row.nombre;
        record.isActive = Boolean(row.is_active);
      })
    );
  }
  for (const id of payload.departamentos?.deleted || []) {
    push(operations, await destroyIfExists(database, 'catalog_departamentos', id));
  }

  // Perfiles: resuelven el nombre del vendedor y del gestor sin red, y son la
  // lista que alimenta los filtros por vendedor (antes vacíos sin conexión).
  for (const row of payload.profiles?.upserts || []) {
    push(
      operations,
      await upsertById<Profile>(database, 'profiles', row.id, (record) => {
        record.fullName = row.full_name ?? null;
        record.email = row.email ?? null;
      })
    );
  }
  for (const id of payload.profiles?.deleted || []) {
    push(operations, await destroyIfExists(database, 'profiles', id));
  }

  for (const row of payload.credit_settings?.upserts || []) {
    push(
      operations,
      await upsertById<CreditSettingsRecord>(database, 'credit_settings', row.id, (record) => {
        record.formulaType = row.formula_type;
        record.interestRateMonthlyPct = Number(row.interest_rate_monthly_pct || 0);
        record.roundingUnit = Number(row.rounding_unit || 0);
        record.lateFeeRatePct = Number(row.late_fee_rate_pct || 0);
        record.moneyDecimalPlaces = Number(row.money_decimal_places || 0);
        record.minInstallments = Number(row.min_installments || 0);
        record.maxInstallments = Number(row.max_installments || 0);
        record.defaultFrequency = row.default_frequency;
        record.legalText = row.legal_text ?? null;
        record.isActive = Boolean(row.is_active);
      })
    );
  }
  for (const id of payload.credit_settings?.deleted || []) {
    push(operations, await destroyIfExists(database, 'credit_settings', id));
  }

  // El catálogo de métodos de pago viaja completo: la pantalla de cobro lo
  // necesita disponible sin red. `payment_methods` es opcional para tolerar un
  // servidor anterior a la migración del catálogo.
  for (const row of payload.payment_methods?.upserts || []) {
    push(
      operations,
      await upsertById<CatalogPaymentMethod>(database, 'catalog_payment_methods', row.id, (record) => {
        record.name = row.name;
      })
    );
  }
  for (const id of payload.payment_methods?.deleted || []) {
    push(operations, await destroyIfExists(database, 'catalog_payment_methods', id));
  }

  const rolesJson = JSON.stringify(payload.roles || []);
  const existingCache = await database
    .get<UserProfileCache>('user_profile_cache')
    .query(Q.where('user_id', userId))
    .fetch();
  if (existingCache[0]) {
    operations.push(
      existingCache[0].prepareUpdate((record) => {
        record.rolesJson = rolesJson;
        record.cachedAt = Date.now();
      })
    );
  } else {
    operations.push(
      database.get<UserProfileCache>('user_profile_cache').prepareCreate((record) => {
        record.userId = userId;
        record.rolesJson = rolesJson;
        record.cachedAt = Date.now();
      })
    );
  }

  await database.write(async () => {
    await database.batch(...operations.filter(Boolean));
  });
}

/**
 * Un negocio reasignado a otro gestor deja de venir en el pull pero nunca llega
 * como `deleted`. Con la lista completa de ids en alcance se eliminan los que
 * ya no pertenecen al usuario, salvo los que tienen cambios locales sin enviar.
 */
export async function pruneOutOfScopeNegocios(database: Database, scopedIds: string[]) {
  const scope = new Set(scopedIds);
  const [negocios, cuotas, pagos, items] = await Promise.all([
    database.get<Negocio>('negocios').query().fetch(),
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    database.get<NegocioPago>('negocio_pagos').query().fetch(),
    database.get<NegocioItem>('negocio_items').query().fetch(),
  ]);
  const withPendingChanges = new Set<string>();
  for (const row of cuotas) if (row.rowSyncStatus === 'pending') withPendingChanges.add(row.negocioId);
  // Un pago rechazado es la única constancia de un recibo ya entregado: el
  // negocio no se borra del teléfono mientras siga ahí sin que nadie lo revise.
  for (const row of pagos) {
    if (row.rowSyncStatus === 'pending' || row.rowSyncStatus === REJECTED_ROW_SYNC_STATUS) {
      withPendingChanges.add(row.negocioId);
    }
  }

  const toRemove = new Set(
    negocios
      .filter(
        (row) =>
          !scope.has(row.id) &&
          !withPendingChanges.has(row.id) &&
          // Un negocio creado sin señal todavía no existe en el servidor, así
          // que nunca está en el alcance: borrarlo sería perder la venta. Lo
          // mismo si el servidor lo rechazó: queda con su motivo hasta que
          // alguien lo revise.
          row.rowSyncStatus !== 'pending' &&
          row.rowSyncStatus !== REJECTED_ROW_SYNC_STATUS
      )
      .map((row) => row.id)
  );
  if (!toRemove.size) return 0;

  const operations: Model[] = [];
  for (const row of negocios) if (toRemove.has(row.id)) operations.push(row.prepareDestroyPermanently());
  for (const row of cuotas) if (toRemove.has(row.negocioId)) operations.push(row.prepareDestroyPermanently());
  for (const row of pagos) if (toRemove.has(row.negocioId)) operations.push(row.prepareDestroyPermanently());
  for (const row of items) if (toRemove.has(row.negocioId)) operations.push(row.prepareDestroyPermanently());

  await database.write(async () => {
    await database.batch(...operations);
  });
  return toRemove.size;
}

/**
 * Recaudador puro (`pull_scope` = 'cobro', 20261128120000): el servidor sólo le
 * baja el titular y el codeudor de cada negocio, pero el teléfono puede traer
 * el directorio completo de antes (una versión anterior de la app, o un rol
 * de vendedor que le quitaron). Se borran los clientes descargados que ya no
 * son de ningún negocio del teléfono. Los creados sin señal (pendientes o
 * rechazados) no se tocan: todavía no existen en el servidor.
 *
 * Debe correr DESPUÉS de `pruneOutOfScopeNegocios`, con los negocios ya al día.
 */
export async function pruneCustomersOutsideNegocios(database: Database) {
  const [customers, negocios] = await Promise.all([
    database.get<Customer>('customers').query().fetch(),
    database.get<Negocio>('negocios').query().fetch(),
  ]);
  const referenced = new Set<string>();
  for (const negocio of negocios) {
    if (negocio.customerId) referenced.add(negocio.customerId);
    if (negocio.codeudorCustomerId) referenced.add(negocio.codeudorCustomerId);
  }
  const operations: Model[] = customers
    .filter((row) => row.rowSyncStatus === 'synced' && !referenced.has(row.id))
    .map((row) => row.prepareDestroyPermanently());
  if (!operations.length) return 0;
  await database.write(async () => {
    await database.batch(...operations);
  });
  return operations.length;
}

/**
 * Guarda el catálogo de producto (productos, bodegas y existencias) que llega
 * sólo cuando se pidió con `p_include_catalog`. Va aparte de
 * `applyPullPayload` porque también lleva su propio cursor: el resto del
 * paquete se baja muchas veces al día y el catálogo no.
 *
 * Devuelve false si el paquete no traía catálogo (no se pidió o el servidor no
 * tiene la migración), para que el cursor del catálogo no avance.
 */
export async function applyCatalogPayload(database: Database, payload: PullPayload) {
  if (!payload.catalog_included || !payload.products) return false;
  const operations: Model[] = [];

  for (const row of payload.products.upserts) {
    push(
      operations,
      await upsertById<CatalogProduct>(database, 'catalog_products', row.id, (record) => {
        record.name = row.name;
        record.sku = row.sku ?? null;
        record.barcode = row.barcode ?? null;
        record.categoryId = row.category_id ?? null;
        record.brandId = row.brand_id ?? null;
        record.status = row.status !== false;
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  // Un producto borrado o desactivado desaparece del teléfono junto con sus
  // existencias: si no, seguiría apareciendo en el buscador sin poder venderse.
  for (const id of payload.products.deleted) {
    push(operations, await destroyIfExists(database, 'catalog_products', id));
    for (const stock of await database
      .get<CatalogWarehouseStock>('catalog_warehouse_stock')
      .query(Q.where('product_id', id))
      .fetch()) {
      operations.push(stock.prepareDestroyPermanently());
    }
  }

  for (const row of payload.warehouses?.upserts || []) {
    push(
      operations,
      await upsertById<CatalogWarehouse>(database, 'catalog_warehouses', row.id, (record) => {
        record.name = row.name;
        record.city = row.city ?? null;
        record.isActive = row.is_active !== false;
      })
    );
  }
  for (const id of payload.warehouses?.deleted || []) {
    push(operations, await destroyIfExists(database, 'catalog_warehouses', id));
  }

  for (const row of payload.warehouse_stock?.upserts || []) {
    push(
      operations,
      await upsertById<CatalogWarehouseStock>(
        database,
        'catalog_warehouse_stock',
        row.id,
        (record) => {
          record.productId = row.product_id;
          record.warehouseId = row.warehouse_id;
          record.quantity = Number(row.quantity || 0);
          record.serverUpdatedAt = toEpoch(row.updated_at);
        }
      )
    );
  }
  for (const id of payload.warehouse_stock?.deleted || []) {
    push(operations, await destroyIfExists(database, 'catalog_warehouse_stock', id));
  }

  await database.write(async () => {
    await database.batch(...operations.filter(Boolean));
  });
  return true;
}

/** Comandos que todavía cuentan: en cola, en vuelo o a la espera de revisión. */
const OUTBOX_STATUSES_THAT_HOLD_DATA = ['pending', 'syncing', 'error', 'failed', 'conflict'];

function payloadRecord(item: SyncOutboxItem): Record<string, unknown> {
  try {
    const parsed = JSON.parse(item.payloadJson);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function addId(target: Set<string>, value: unknown) {
  if (typeof value === 'string' && value) target.add(value);
}

/**
 * Lo que el teléfono no puede perder aunque ya no esté en la selección:
 * clientes de negocios locales o de comandos sin enviar, y productos de los
 * negocios que aún no confirma el servidor.
 */
async function protectedSelectiveIds(database: Database) {
  const [negocios, items, outbox] = await Promise.all([
    database.get<Negocio>('negocios').query().fetch(),
    database.get<NegocioItem>('negocio_items').query().fetch(),
    database
      .get<SyncOutboxItem>('sync_outbox')
      .query(Q.where('status', Q.oneOf(OUTBOX_STATUSES_THAT_HOLD_DATA)))
      .fetch(),
  ]);
  const customers = new Set<string>();
  const products = new Set<string>();
  const unconfirmedNegocios = new Set<string>();
  for (const negocio of negocios) {
    addId(customers, negocio.customerId);
    addId(customers, negocio.codeudorCustomerId);
    if (negocio.rowSyncStatus !== 'synced') unconfirmedNegocios.add(negocio.id);
  }
  for (const item of items) {
    if (item.rowSyncStatus !== 'synced' || unconfirmedNegocios.has(item.negocioId)) {
      addId(products, item.productId);
    }
  }
  for (const command of outbox) {
    const payload = payloadRecord(command);
    addId(customers, payload.customerId);
    const negocio = (payload.negocio || {}) as Record<string, unknown>;
    addId(customers, negocio.customer_id);
    addId(customers, negocio.codeudor_customer_id);
    if (Array.isArray(payload.items)) {
      for (const item of payload.items as Record<string, unknown>[]) addId(products, item?.product_id);
    }
  }
  return { customers, products };
}

/**
 * Descarga selectiva (20261130140000): tras un paquete NO recortado, en cada
 * dominio que vino completo (`full_domains_sent`) se borra lo `synced` que no
 * llegó, porque ya no está en lo que la persona lleva en el teléfono.
 *
 * Nunca se borra: una fila pendiente o rechazada (todavía no existe en el
 * servidor, o espera revisión), un cliente de un negocio local o de un
 * comando sin enviar, ni un producto de un negocio pendiente. `productos`
 * sólo se poda si el catálogo llegó en este paquete (tiene su propio cursor:
 * ver `catalogPull.ts`).
 *
 * Debe correr DESPUÉS de `pruneOutOfScopeNegocios`, con los negocios al día,
 * igual que `pruneCustomersOutsideNegocios`.
 */
export async function purgeUnselectedDomains(
  database: Database,
  payload: PullPayload,
  input: { catalogApplied: boolean }
): Promise<{ customers: number; products: number; stock: number }> {
  const result = { customers: 0, products: 0, stock: 0 };
  if (payload.truncated) return result;
  const sent = new Set(fullDomainsSent(payload));
  const purgeCustomers = sent.has('clientes');
  const purgeProducts =
    sent.has('productos') && input.catalogApplied && Boolean(payload.catalog_included && payload.products);
  if (!purgeCustomers && !purgeProducts) return result;

  const keep = await protectedSelectiveIds(database);
  const operations: Model[] = [];

  if (purgeCustomers) {
    const received = new Set(payload.customers.upserts.map((row) => row.id));
    const customers = await database.get<Customer>('customers').query().fetch();
    for (const row of customers) {
      if (row.rowSyncStatus !== 'synced') continue;
      if (received.has(row.id) || keep.customers.has(row.id)) continue;
      operations.push(row.prepareDestroyPermanently());
      result.customers += 1;
    }
  }

  if (purgeProducts && payload.products) {
    const receivedProducts = new Set(payload.products.upserts.map((row) => row.id));
    const receivedStock = new Set((payload.warehouse_stock?.upserts || []).map((row) => row.id));
    const [products, stock] = await Promise.all([
      database.get<CatalogProduct>('catalog_products').query().fetch(),
      database.get<CatalogWarehouseStock>('catalog_warehouse_stock').query().fetch(),
    ]);
    const removed = new Set<string>();
    for (const row of products) {
      if (receivedProducts.has(row.id) || keep.products.has(row.id)) continue;
      operations.push(row.prepareDestroyPermanently());
      removed.add(row.id);
      result.products += 1;
    }
    for (const row of stock) {
      if (keep.products.has(row.productId)) continue;
      if (!removed.has(row.productId) && receivedStock.has(row.id)) continue;
      operations.push(row.prepareDestroyPermanently());
      result.stock += 1;
    }
  }

  if (!operations.length) return result;
  await database.write(async () => {
    await database.batch(...operations);
  });
  return result;
}
