import { Q } from '@nozbe/watermelondb';
import type { Database, Model } from '@nozbe/watermelondb';
import {
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  Customer,
  FileUpload,
  Negocio,
  NegocioCuota,
  NegocioPago,
  SyncOutboxItem,
} from '../models';
import { deleteLocalPagoSupportFile } from '../security/localFiles';
import { parseOutboxPayload } from './outbox';
import type {
  AttachPagoSupportPayload,
  CreateCustomerPayload,
  OptimisticSnapshot,
  OutboxPayloadBase,
  RegisterPagoPayload,
} from './types';

/**
 * WatermelonDB no permite dos `prepareUpdate` sobre el mismo registro dentro
 * de un batch. El colector fusiona todas las mutaciones de un registro en una
 * sola operación preparada y acumula creates/destroys aparte.
 */
export class PreparedChanges {
  private updates = new Map<string, { record: Model; mutators: ((row: never) => void)[] }>();
  private others: Model[] = [];

  update<T extends Model>(record: T, mutator: (row: T) => void) {
    const key = `${record.table}:${record.id}`;
    const entry = this.updates.get(key);
    if (entry) {
      entry.mutators.push(mutator as (row: never) => void);
      return;
    }
    this.updates.set(key, { record, mutators: [mutator as (row: never) => void] });
  }

  add(operation: Model | null | undefined) {
    if (operation) this.others.push(operation);
  }

  build(): Model[] {
    const prepared: Model[] = [];
    for (const { record, mutators } of this.updates.values()) {
      prepared.push(
        record.prepareUpdate((row) => {
          for (const mutate of mutators) mutate(row as never);
        })
      );
    }
    return [...prepared, ...this.others];
  }
}

async function findOrNull<T extends Model>(database: Database, table: string, id: string): Promise<T | null> {
  try {
    return await database.get<T>(table).find(id);
  } catch {
    return null;
  }
}

/**
 * Restaura las filas capturadas en el snapshot. Solo toca filas que siguen en
 * `pending`: si el pull ya las reemplazó con datos del servidor, esos datos
 * son la verdad y no deben pisarse.
 */
export async function prepareRevertSnapshot(
  database: Database,
  snapshot: OptimisticSnapshot | undefined,
  changes: PreparedChanges
) {
  if (!snapshot) return;

  for (const cuota of snapshot.cuotas || []) {
    const record = await findOrNull<NegocioCuota>(database, 'negocio_cuotas', cuota.id);
    if (!record || record.rowSyncStatus !== 'pending') continue;
    changes.update(record, (row) => {
      row.paidAmount = cuota.paidAmount;
      row.status = cuota.status;
      row.rowSyncStatus = cuota.rowSyncStatus;
    });
  }

  if (snapshot.negocio) {
    const record = await findOrNull<Negocio>(database, 'negocios', snapshot.negocio.id);
    const remaining = snapshot.negocio.remainingBalance;
    if (record) {
      changes.update(record, (row) => {
        row.remainingBalance = remaining;
      });
    }
  }

  for (const stop of snapshot.stops || []) {
    const record = await findOrNull<CollectionRouteStopRecord>(database, 'collection_route_stops', stop.id);
    if (!record || record.rowSyncStatus !== 'pending') continue;
    changes.update(record, (row) => {
      row.status = stop.status;
      row.paymentId = stop.paymentId;
      row.paymentAmount = stop.paymentAmount;
      row.outcomeReason = stop.outcomeReason;
      row.notes = stop.notes;
      row.arrivedAt = stop.arrivedAt;
      row.completedAt = stop.completedAt;
      row.rowSyncStatus = stop.rowSyncStatus;
    });
  }

  if (snapshot.route) {
    const route = snapshot.route;
    const record = await findOrNull<CollectionRouteRecord>(database, 'collection_routes', route.id);
    if (record && record.rowSyncStatus === 'pending') {
      changes.update(record, (row) => {
        row.status = route.status;
        row.startedAt = route.startedAt;
        row.completedAt = route.completedAt;
        row.rowSyncStatus = route.rowSyncStatus;
      });
    }
  }
}

/**
 * Tras confirmar un comando, las filas optimistas vuelven a `synced` para que
 * el pull inmediato pueda reemplazarlas con la versión del servidor.
 */
export async function prepareReleaseSnapshot(
  database: Database,
  snapshot: OptimisticSnapshot | undefined,
  changes: PreparedChanges
) {
  if (!snapshot) return;
  const release = (row: { rowSyncStatus: string }) => {
    row.rowSyncStatus = 'synced';
  };

  for (const cuota of snapshot.cuotas || []) {
    const record = await findOrNull<NegocioCuota>(database, 'negocio_cuotas', cuota.id);
    if (record && record.rowSyncStatus === 'pending') changes.update(record, release);
  }
  for (const stop of snapshot.stops || []) {
    const record = await findOrNull<CollectionRouteStopRecord>(database, 'collection_route_stops', stop.id);
    if (record && record.rowSyncStatus === 'pending') changes.update(record, release);
  }
  if (snapshot.route) {
    const record = await findOrNull<CollectionRouteRecord>(database, 'collection_routes', snapshot.route.id);
    if (record && record.rowSyncStatus === 'pending') changes.update(record, release);
  }
}

/**
 * Deshace el efecto local de un comando rechazado definitivamente. Para pagos
 * también elimina la fila optimista y marca como fallidos los soportes que
 * dependían de él. Devuelve operaciones listas para `database.batch`.
 */
export async function prepareRevertCommand(
  database: Database,
  item: SyncOutboxItem,
  reason: string | null = item.lastError,
  changes = new PreparedChanges()
): Promise<Model[]> {
  const payload = parseOutboxPayload<OutboxPayloadBase & Record<string, unknown>>(item);
  await prepareRevertSnapshot(database, payload.snapshot, changes);

  if (item.type === 'register_pago' || item.type === 'register_route_pago') {
    const pagoLocalId = String((payload as RegisterPagoPayload).pagoLocalId || '');
    if (pagoLocalId) {
      const pago = await findOrNull<NegocioPago>(database, 'negocio_pagos', pagoLocalId);
      if (pago && pago.rowSyncStatus === 'pending') changes.add(pago.prepareDestroyPermanently());
      await prepareFailPagoSupport(
        database,
        pagoLocalId,
        reason ? `El pago no fue aceptado: ${reason}` : 'El pago no fue aceptado por el servidor',
        changes
      );
    }
  }

  if (item.type === 'attach_pago_support') {
    const upload = await findOrNull<FileUpload>(database, 'file_uploads', String(payload.fileUploadId || ''));
    if (upload && upload.status !== 'done') {
      changes.update(upload, (row) => {
        row.status = 'failed';
        row.lastError = reason;
      });
      void deleteLocalPagoSupportFile(upload.localUri);
    }
  }

  if (item.type === 'create_customer') {
    const customerId = String((payload as CreateCustomerPayload).customerId || '');
    const customer = await findOrNull<Customer>(database, 'customers', customerId);
    if (customer && customer.rowSyncStatus === 'pending') changes.add(customer.prepareDestroyPermanently());
  }

  return changes.build();
}

async function prepareFailPagoSupport(
  database: Database,
  pagoLocalId: string,
  reason: string,
  changes: PreparedChanges
) {
  const uploads = await database
    .get<FileUpload>('file_uploads')
    .query(Q.where('pago_local_id', pagoLocalId))
    .fetch();
  const uploadIds = new Set<string>();
  for (const upload of uploads) {
    if (upload.status === 'done') continue;
    uploadIds.add(upload.id);
    changes.update(upload, (row) => {
      row.status = 'failed';
      row.lastError = reason;
    });
    void deleteLocalPagoSupportFile(upload.localUri);
  }
  if (!uploadIds.size) return;

  const attachItems = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('type', 'attach_pago_support'), Q.where('status', Q.oneOf(['pending', 'error'])))
    .fetch();
  for (const attach of attachItems) {
    const attachPayload = parseOutboxPayload<AttachPagoSupportPayload>(attach);
    if (!uploadIds.has(String(attachPayload.fileUploadId || ''))) continue;
    changes.update(attach, (row) => {
      row.status = 'failed';
      row.lastError = reason;
    });
  }
}

/**
 * El servidor asigna su propio id al pago. Tras confirmarlo, la fila optimista
 * (id local) se reemplaza por una fila con el id del servidor para que el pull
 * no la duplique, y las referencias locales (parada, soporte) apuntan al id real.
 */
export async function prepareReconcileRegisteredPago(
  database: Database,
  payload: RegisterPagoPayload,
  pagoServerId: string,
  changes: PreparedChanges
) {
  const localId = payload.pagoLocalId;
  if (!localId || !pagoServerId || localId === pagoServerId) return;

  const local = await findOrNull<NegocioPago>(database, 'negocio_pagos', localId);
  const existingServerRow = await findOrNull<NegocioPago>(database, 'negocio_pagos', pagoServerId);
  if (local) {
    if (!existingServerRow) {
      changes.add(
        database.get<NegocioPago>('negocio_pagos').prepareCreate((row) => {
          row._raw.id = pagoServerId;
          row.negocioId = local.negocioId;
          row.cuotaId = local.cuotaId;
          row.amount = local.amount;
          row.paidAt = local.paidAt;
          row.receiptNumber = local.receiptNumber;
          row.virtualReceiptNumber = local.virtualReceiptNumber;
          row.receiptStatus = local.receiptStatus;
          row.notes = local.notes;
          row.createdByName = local.createdByName;
          row.rowSyncStatus = 'synced';
          row.serverUpdatedAt = null;
        })
      );
    }
    changes.add(local.prepareDestroyPermanently());
  }

  const stops = await database
    .get<CollectionRouteStopRecord>('collection_route_stops')
    .query(Q.where('payment_id', localId))
    .fetch();
  for (const stop of stops) {
    changes.update(stop, (row) => {
      row.paymentId = pagoServerId;
    });
  }

  const uploads = await database
    .get<FileUpload>('file_uploads')
    .query(Q.where('pago_local_id', localId))
    .fetch();
  for (const upload of uploads) {
    changes.update(upload, (row) => {
      row.pagoServerId = pagoServerId;
    });
  }
}

/**
 * Conflicto de documento: el servidor ya tiene un cliente con esa cédula. Se
 * adopta el cliente existente localmente y se elimina el provisional para que
 * la búsqueda offline no muestre dos filas con el mismo documento.
 */
export async function prepareAdoptExistingCustomer(
  database: Database,
  payload: CreateCustomerPayload,
  existing: { id: string; name: string },
  changes: PreparedChanges
) {
  const local = await findOrNull<Customer>(database, 'customers', payload.customerId);
  const server = await findOrNull<Customer>(database, 'customers', existing.id);
  if (server) {
    changes.update(server, (row) => {
      row.name = existing.name || row.name;
      row.rowSyncStatus = 'synced';
    });
  } else {
    changes.add(
      database.get<Customer>('customers').prepareCreate((row) => {
        row._raw.id = existing.id;
        row.name = existing.name || payload.name;
        row.idNumber = payload.idNumber;
        row.phone = local?.phone ?? payload.phone;
        row.rowSyncStatus = 'synced';
        row.localUpdatedAt = Date.now();
        row.serverUpdatedAt = null;
      })
    );
  }
  if (local && local.id !== existing.id) changes.add(local.prepareDestroyPermanently());
}
