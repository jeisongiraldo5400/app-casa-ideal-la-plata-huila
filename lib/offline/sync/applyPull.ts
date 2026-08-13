import { Q } from '@nozbe/watermelondb';
import type { Database, Model } from '@nozbe/watermelondb';
import type { PullPayload } from './types';
import { toEpoch } from './types';
import {
  CatalogMunicipio,
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  Customer,
  Negocio,
  NegocioCuota,
  NegocioPago,
  UserProfileCache,
} from '../models';

async function upsertById<T extends Model>(
  database: Database,
  table: string,
  id: string,
  prepare: (record: T) => void
) {
  const collection = database.get<T>(table);
  try {
    const existing = await collection.find(id);
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

export async function applyPullPayload(database: Database, payload: PullPayload, userId: string) {
  const operations: Model[] = [];

  for (const row of payload.customers.upserts) {
    operations.push(
      await upsertById<Customer>(database, 'customers', row.id, (record) => {
        record.name = row.name;
        record.idNumber = row.id_number;
        record.phone = row.phone;
        record.rowSyncStatus = 'synced';
        record.localUpdatedAt = Date.now();
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.customers.deleted) {
    const op = await destroyIfExists(database, 'customers', id);
    if (op) operations.push(op);
  }

  for (const row of payload.negocios.upserts) {
    operations.push(
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
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.updated_at);
      })
    );
  }
  for (const id of payload.negocios.deleted) {
    const op = await destroyIfExists(database, 'negocios', id);
    if (op) operations.push(op);
  }

  for (const row of payload.negocio_cuotas.upserts) {
    operations.push(
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
    const op = await destroyIfExists(database, 'negocio_cuotas', id);
    if (op) operations.push(op);
  }

  for (const row of payload.negocio_pagos.upserts) {
    operations.push(
      await upsertById<NegocioPago>(database, 'negocio_pagos', row.id, (record) => {
        record.negocioId = row.negocio_id;
        record.cuotaId = row.cuota_id;
        record.amount = Number(row.amount || 0);
        record.paidAt = row.paid_at;
        record.receiptNumber = row.receipt_number;
        record.virtualReceiptNumber = row.virtual_receipt_number;
        record.receiptStatus = row.receipt_status || 'emitido';
        record.notes = row.notes;
        record.rowSyncStatus = 'synced';
        record.serverUpdatedAt = toEpoch(row.created_at);
      })
    );
  }
  for (const id of payload.negocio_pagos.deleted) {
    const op = await destroyIfExists(database, 'negocio_pagos', id);
    if (op) operations.push(op);
  }

  for (const row of payload.collection_routes.upserts) {
    operations.push(
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
    const op = await destroyIfExists(database, 'collection_routes', id);
    if (op) operations.push(op);
  }

  for (const row of payload.collection_route_stops.upserts) {
    operations.push(
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
    const op = await destroyIfExists(database, 'collection_route_stops', id);
    if (op) operations.push(op);
  }

  for (const row of payload.municipios.upserts) {
    operations.push(
      await upsertById<CatalogMunicipio>(database, 'catalog_municipios', row.id, (record) => {
        record.nombre = row.nombre;
        record.isActive = Boolean(row.is_active);
      })
    );
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
