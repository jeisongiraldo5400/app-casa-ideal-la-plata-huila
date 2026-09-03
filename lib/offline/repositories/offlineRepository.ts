import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { createIdempotencyKey } from '@/lib/idempotency';
import type { CarteraFilter, CarteraRow, Municipio } from '@/lib/cartera/carteraService';
import type { CollectionRoute, CollectionRouteSummary } from '@/lib/collection-routes/types';
import type { CustomerWithNegocios } from '@/lib/negocios/searchCustomerNegocios';
import { getDatabase, isDatabaseOpen } from '../database';
import {
  CatalogMunicipio,
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  Customer,
  FileUpload,
  Negocio,
  NegocioCuota,
  NegocioPago,
  ReportSnapshot,
  SyncOutboxItem,
} from '../models';
import {
  applyPagoToCuotas,
  emptyCarteraDashboard,
  filterCarteraCuotas,
  searchCustomersLocal,
  summarizeCarteraFromCuotas,
} from '../domain/carteraLocal';
import {
  mapNegocioDetailFromLocal,
  mapNegociosListFromLocal,
  remainingForNegocio,
} from '../domain/negociosLocal';
import {
  listReviewableOutbox,
  markOutboxDiscarded,
  parseOutboxPayload,
  prepareOutboxRecord,
  resetOutboxItem,
} from '../sync/outbox';
import { prepareRevertCommand } from '../sync/reconcile';
import { refreshPendingCount, runSync } from '../sync/syncEngine';
import {
  laneForCommand,
  type CuotaSnapshot,
  type OptimisticSnapshot,
  type OutboxCommandType,
  type RegisterPagoPayload,
  type RouteSnapshot,
  type StopSnapshot,
} from '../sync/types';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';
import { PAGO_SUPPORT_BUCKET } from '@/lib/uploadPagoSupport';
import {
  deleteLocalPagoSupportFile,
  persistPagoSupportFile,
} from '../security/localFiles';

export function canUseLocalDb() {
  return isDatabaseOpen();
}

const FINISHED_STOP_STATUSES = ['cobrado', 'sin_pago', 'reprogramado', 'omitido'];

function snapshotCuota(row: NegocioCuota): CuotaSnapshot {
  return { id: row.id, paidAmount: row.paidAmount, status: row.status, rowSyncStatus: row.rowSyncStatus };
}

function snapshotStop(row: CollectionRouteStopRecord): StopSnapshot {
  return {
    id: row.id,
    status: row.status,
    paymentId: row.paymentId,
    paymentAmount: row.paymentAmount,
    outcomeReason: row.outcomeReason,
    notes: row.notes,
    arrivedAt: row.arrivedAt,
    completedAt: row.completedAt,
    rowSyncStatus: row.rowSyncStatus,
  };
}

function snapshotRoute(row: CollectionRouteRecord): RouteSnapshot {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    rowSyncStatus: row.rowSyncStatus,
  };
}

async function findOrNull<T extends Model>(table: string, id: string): Promise<T | null> {
  try {
    return await getDatabase().get<T>(table).find(id);
  } catch {
    return null;
  }
}

export async function searchCustomersFromLocal(term: string, limit = 20) {
  if (!canUseLocalDb()) return [];
  const customers = await getDatabase().get<Customer>('customers').query().fetch();
  return searchCustomersLocal(
    customers.map((row) => ({
      id: row.id,
      name: row.name,
      idNumber: row.idNumber,
      phone: row.phone,
    })),
    term,
    limit
  );
}

export async function searchCustomerNegociosFromLocal(term: string, limit = 20): Promise<CustomerWithNegocios[]> {
  if (!canUseLocalDb()) return [];
  const matched = await searchCustomersFromLocal(term, limit);
  if (!matched.length) return [];
  const database = getDatabase();
  const negocios = await database.get<Negocio>('negocios').query().fetch();
  const cuotas = await database.get<NegocioCuota>('negocio_cuotas').query().fetch();
  const cuotaRows = cuotas.map((row) => ({
    id: row.id,
    negocioId: row.negocioId,
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    amount: row.amount,
    paidAmount: row.paidAmount,
    lateFeeAmount: row.lateFeeAmount,
    status: row.status,
  }));
  return matched.map((customer) => {
    const related = negocios.filter(
      (negocio) => negocio.customerId === customer.id || negocio.codeudorCustomerId === customer.id
    );
    return {
      customer_id: customer.id,
      customer_name: customer.name,
      customer_id_number: customer.idNumber,
      customer_phone: customer.phone,
      negocios: related.map((negocio) => {
        const role =
          negocio.customerId === customer.id && negocio.codeudorCustomerId === customer.id
            ? 'titular_y_codeudor'
            : negocio.customerId === customer.id
              ? 'titular'
              : 'codeudor';
        return {
          negocio_id: negocio.id,
          negocio_numero: negocio.numero,
          status: negocio.status,
          deal_date: negocio.dealDate,
          total_credit: negocio.totalCredit,
          remaining_balance: remainingForNegocio(
            {
              id: negocio.id,
              numero: negocio.numero,
              status: negocio.status,
              dealDate: negocio.dealDate,
              totalCredit: negocio.totalCredit,
              remainingBalance: negocio.remainingBalance,
              customerId: negocio.customerId,
              codeudorCustomerId: negocio.codeudorCustomerId,
              direccion: negocio.direccion,
              municipioId: negocio.municipioId,
              municipioName: negocio.municipioName,
              sellerId: negocio.sellerId,
            },
            cuotaRows
          ),
          direccion: negocio.direccion || 'Dirección no registrada',
          municipio_name: negocio.municipioName,
          role_in_negocio: role,
        };
      }),
    };
  });
}

export async function createCustomerOffline(input: {
  name: string;
  idNumber: string;
  phone: string | null;
}) {
  const database = getDatabase();
  const existing = await database
    .get<Customer>('customers')
    .query(Q.where('id_number', input.idNumber))
    .fetch();
  if (existing[0]) {
    throw new Error(`Ya existe un cliente local con documento ${input.idNumber}`);
  }
  const customerId = createIdempotencyKey();
  const idempotencyKey = createIdempotencyKey();
  await database.write(async () => {
    await database.batch(
      database.get<Customer>('customers').prepareCreate((record) => {
        record._raw.id = customerId;
        record.name = input.name;
        record.idNumber = input.idNumber;
        record.phone = input.phone;
        record.rowSyncStatus = 'pending';
        record.localUpdatedAt = Date.now();
        record.serverUpdatedAt = null;
      }),
      prepareOutboxRecord(
        database,
        'create_customer',
        {
          customerId,
          name: input.name,
          idNumber: input.idNumber,
          phone: input.phone,
        },
        idempotencyKey
      )
    );
  });
  void refreshPendingCount();
  void runSync('mutation');
  return { id: customerId, name: input.name, id_number: input.idNumber };
}

export async function fetchNegociosListFromLocal() {
  if (!canUseLocalDb()) return [];
  const database = getDatabase();
  const [negocios, customers, cuotas] = await Promise.all([
    database.get<Negocio>('negocios').query().fetch(),
    database.get<Customer>('customers').query().fetch(),
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
  ]);
  return mapNegociosListFromLocal(
    negocios.map((row) => ({
      id: row.id,
      numero: row.numero,
      status: row.status,
      dealDate: row.dealDate,
      totalCredit: row.totalCredit,
      remainingBalance: row.remainingBalance,
      customerId: row.customerId,
      codeudorCustomerId: row.codeudorCustomerId,
      direccion: row.direccion,
      municipioId: row.municipioId,
      municipioName: row.municipioName,
      sellerId: row.sellerId,
    })),
    customers.map((row) => ({
      id: row.id,
      name: row.name,
      idNumber: row.idNumber,
      phone: row.phone,
    })),
    cuotas.map((row) => ({
      id: row.id,
      negocioId: row.negocioId,
      installmentNumber: row.installmentNumber,
      dueDate: row.dueDate,
      amount: row.amount,
      paidAmount: row.paidAmount,
      lateFeeAmount: row.lateFeeAmount,
      status: row.status,
    }))
  );
}

export async function fetchNegocioDetailFromLocal(negocioId: string) {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  const negocio = await findOrNull<Negocio>('negocios', negocioId);
  if (!negocio) return null;
  const [customers, cuotas, pagos] = await Promise.all([
    database.get<Customer>('customers').query().fetch(),
    database.get<NegocioCuota>('negocio_cuotas').query(Q.where('negocio_id', negocioId)).fetch(),
    database.get<NegocioPago>('negocio_pagos').query(Q.where('negocio_id', negocioId)).fetch(),
  ]);
  return mapNegocioDetailFromLocal({
    negocio: {
      id: negocio.id,
      numero: negocio.numero,
      status: negocio.status,
      dealDate: negocio.dealDate,
      totalCredit: negocio.totalCredit,
      remainingBalance: negocio.remainingBalance,
      customerId: negocio.customerId,
      codeudorCustomerId: negocio.codeudorCustomerId,
      direccion: negocio.direccion,
      municipioId: negocio.municipioId,
      municipioName: negocio.municipioName,
      sellerId: negocio.sellerId,
    },
    customers: customers.map((row) => ({
      id: row.id,
      name: row.name,
      idNumber: row.idNumber,
      phone: row.phone,
    })),
    cuotas: cuotas.map((row) => ({
      id: row.id,
      negocioId: row.negocioId,
      installmentNumber: row.installmentNumber,
      dueDate: row.dueDate,
      amount: row.amount,
      paidAmount: row.paidAmount,
      lateFeeAmount: row.lateFeeAmount,
      status: row.status,
    })),
    pagos: pagos.map((row) => ({
      id: row.id,
      negocioId: row.negocioId,
      cuotaId: row.cuotaId,
      amount: row.amount,
      paidAt: row.paidAt,
      receiptNumber: row.receiptNumber,
      virtualReceiptNumber: row.virtualReceiptNumber,
      receiptStatus: row.receiptStatus,
      notes: row.notes,
      createdByName: row.createdByName,
    })),
  });
}

export async function fetchCarteraDashboardFromLocal() {
  if (!canUseLocalDb()) return null;
  const cuotas = await getDatabase().get<NegocioCuota>('negocio_cuotas').query().fetch();
  const summary = summarizeCarteraFromCuotas(
    cuotas.map((cuota) => ({
      id: cuota.id,
      dueDate: cuota.dueDate,
      amount: cuota.amount,
      paidAmount: cuota.paidAmount,
      lateFeeAmount: cuota.lateFeeAmount,
      status: cuota.status,
    }))
  );
  return emptyCarteraDashboard(summary);
}

export async function fetchCarteraFromLocal(params: {
  filter: CarteraFilter;
  search: string;
  page: number;
  pageSize: number;
  days: number;
  municipioId: string;
  sellerId?: string;
}): Promise<{ rows: CarteraRow[]; totalCount: number } | null> {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  const [cuotas, negocios, customers] = await Promise.all([
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    database.get<Negocio>('negocios').query().fetch(),
    database.get<Customer>('customers').query().fetch(),
  ]);
  const negocioById = new Map(negocios.map((row) => [row.id, row]));
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const mapped = cuotas.map((cuota) => {
    const negocio = negocioById.get(cuota.negocioId);
    const customer = negocio ? customerById.get(negocio.customerId) : undefined;
    const saldo = Math.max(cuota.amount + cuota.lateFeeAmount - cuota.paidAmount, 0);
    return {
      id: cuota.id,
      dueDate: cuota.dueDate,
      amount: cuota.amount,
      paidAmount: cuota.paidAmount,
      lateFeeAmount: cuota.lateFeeAmount,
      status: cuota.status,
      customerName: customer?.name || 'Cliente',
      customerIdNumber: customer?.idNumber || null,
      municipioId: negocio?.municipioId || null,
      sellerId: negocio?.sellerId || null,
      negocioNumero: negocio?.numero || 0,
      row: {
        cuota_id: cuota.id,
        negocio_id: cuota.negocioId,
        negocio_numero: negocio?.numero || 0,
        customer_name: customer?.name || null,
        customer_id_number: customer?.idNumber || null,
        customer_phone: customer?.phone || null,
        municipio_id: negocio?.municipioId || null,
        municipio_name: negocio?.municipioName || null,
        seller_id: negocio?.sellerId || null,
        seller_name: null,
        installment_number: cuota.installmentNumber,
        due_date: cuota.dueDate,
        amount: cuota.amount,
        paid_amount: cuota.paidAmount,
        late_fee_amount: cuota.lateFeeAmount,
        saldo,
        status: cuota.status,
        total_count: 0,
      } satisfies CarteraRow,
    };
  });
  const filtered = filterCarteraCuotas(mapped, params);
  const totalCount = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  const rows = filtered.slice(start, start + params.pageSize).map((item) => ({
    ...item.row,
    total_count: totalCount,
  }));
  return { rows, totalCount };
}

export async function fetchMunicipiosFromLocal(): Promise<Municipio[] | null> {
  if (!canUseLocalDb()) return null;
  const rows = await getDatabase().get<CatalogMunicipio>('catalog_municipios').query().fetch();
  return rows
    .filter((row) => row.isActive)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((row) => ({ id: row.id, nombre: row.nombre }));
}

/**
 * Registra un pago sin red: fila optimista + cuotas actualizadas + parada de
 * ruta (si aplica) + comando en el outbox, todo en un único batch atómico.
 * El snapshot previo viaja en el payload para poder revertir si el servidor
 * rechaza el pago de forma definitiva.
 */
export async function registerPagoOffline(input: {
  negocioId: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  idempotencyKey?: string | null;
  routeStopId?: string | null;
  supportFile?: PagoSupportLocalFile | null;
  /** Nombre del usuario que registra el pago (para mostrarlo sin red). */
  registeredBy?: string | null;
}) {
  const database = getDatabase();
  const negocio = await findOrNull<Negocio>('negocios', input.negocioId);
  if (!negocio) {
    throw new Error(
      'Este negocio no está descargado en el dispositivo. Conéctese y pulse Descargar información antes de registrar pagos sin red.'
    );
  }
  const cuotas = await database
    .get<NegocioCuota>('negocio_cuotas')
    .query(Q.where('negocio_id', input.negocioId))
    .fetch();
  if (!cuotas.length) {
    throw new Error('No hay cuotas descargadas para este negocio. Descargue la información antes de registrar pagos sin red.');
  }

  const applied = applyPagoToCuotas(
    cuotas.map((cuota) => ({
      id: cuota.id,
      dueDate: cuota.dueDate,
      amount: cuota.amount,
      paidAmount: cuota.paidAmount,
      lateFeeAmount: cuota.lateFeeAmount,
      status: cuota.status,
    })),
    input.amount
  );
  if (applied.leftover > 0.009) {
    throw new Error('El valor supera el saldo pendiente de las cuotas descargadas.');
  }

  const stop = input.routeStopId
    ? await findOrNull<CollectionRouteStopRecord>('collection_route_stops', input.routeStopId)
    : null;
  const nextStop = stop ? await findNextPendingStop(stop.routeId, stop.id) : null;

  const pagoLocalId = createIdempotencyKey();
  const idempotencyKey = input.idempotencyKey || createIdempotencyKey();
  const paymentCommandType: OutboxCommandType = input.routeStopId ? 'register_route_pago' : 'register_pago';
  const snapshot: OptimisticSnapshot = {
    cuotas: cuotas.map(snapshotCuota),
    negocio: { id: negocio.id, remainingBalance: negocio.remainingBalance },
    stops: [stop, nextStop].filter((row): row is CollectionRouteStopRecord => Boolean(row)).map(snapshotStop),
  };
  const paymentPayload: RegisterPagoPayload = {
    pagoLocalId,
    negocioId: input.negocioId,
    amount: input.amount,
    paidAt: input.paidAt,
    receiptNumber: input.receiptNumber,
    notes: null,
    routeStopId: input.routeStopId || null,
    routeId: stop?.routeId || null,
    snapshot,
  };
  const lane = laneForCommand(paymentCommandType, paymentPayload as unknown as Record<string, unknown>);
  paymentPayload.lane = lane;

  const cuotaById = new Map(cuotas.map((row) => [row.id, row]));
  const nowIso = new Date().toISOString();

  await database.write(async () => {
    const operations: Model[] = [
      database.get<NegocioPago>('negocio_pagos').prepareCreate((record) => {
        record._raw.id = pagoLocalId;
        record.negocioId = input.negocioId;
        record.cuotaId = null;
        record.amount = input.amount;
        record.paidAt = input.paidAt;
        record.receiptNumber = input.receiptNumber;
        record.virtualReceiptNumber = null;
        record.receiptStatus = 'emitido';
        record.notes = null;
        record.createdByName = input.registeredBy || null;
        record.rowSyncStatus = 'pending';
        record.serverUpdatedAt = null;
      }),
    ];
    for (const cuota of applied.cuotas) {
      const local = cuotaById.get(cuota.id);
      if (!local) continue;
      if (local.paidAmount === cuota.paidAmount && local.status === cuota.status) continue;
      operations.push(
        local.prepareUpdate((record) => {
          record.paidAmount = cuota.paidAmount;
          record.status = cuota.status;
          record.rowSyncStatus = 'pending';
        })
      );
    }
    operations.push(
      negocio.prepareUpdate((record) => {
        record.remainingBalance = applied.remainingBalance;
      })
    );
    if (stop) {
      operations.push(
        stop.prepareUpdate((record) => {
          record.status = 'cobrado';
          record.paymentId = pagoLocalId;
          record.paymentAmount = input.amount;
          record.arrivedAt = record.arrivedAt || nowIso;
          record.completedAt = nowIso;
          record.rowSyncStatus = 'pending';
        })
      );
    }
    if (nextStop) {
      operations.push(
        nextStop.prepareUpdate((record) => {
          record.status = 'actual';
          record.arrivedAt = record.arrivedAt || nowIso;
          record.rowSyncStatus = 'pending';
        })
      );
    }
    operations.push(prepareOutboxRecord(database, paymentCommandType, paymentPayload, idempotencyKey));
    await database.batch(...operations);
  });

  let supportWarning: string | null = null;
  if (input.supportFile) {
    try {
      await queuePagoSupportUpload({
        negocioId: input.negocioId,
        pagoLocalId,
        pagoServerId: null,
        file: input.supportFile,
        lane,
      });
    } catch (error) {
      supportWarning =
        error instanceof Error
          ? error.message
          : 'El pago quedó guardado, pero no se pudo conservar el soporte';
    }
  }

  void refreshPendingCount();
  void runSync('mutation');
  return { pagoLocalId, pendingReceipt: true, supportWarning };
}

async function findNextPendingStop(routeId: string, excludeStopId: string) {
  const stops = await getDatabase()
    .get<CollectionRouteStopRecord>('collection_route_stops')
    .query(Q.where('route_id', routeId), Q.where('status', 'pendiente'))
    .fetch();
  return (
    stops
      .filter((row) => row.id !== excludeStopId)
      .sort((a, b) => a.position - b.position)[0] || null
  );
}

export async function queuePagoSupportUpload(input: {
  negocioId: string;
  pagoLocalId: string | null;
  pagoServerId: string | null;
  file: PagoSupportLocalFile;
  /** Carril del pago al que pertenece; garantiza que se suba después del pago. */
  lane?: string;
}) {
  const database = getDatabase();
  const fileLocalId = createIdempotencyKey();
  const localUri = await persistPagoSupportFile(
    input.file.uri,
    fileLocalId,
    input.file.name
  );

  let upload: FileUpload;
  try {
    upload = await database.write(async () => {
      const created = database.get<FileUpload>('file_uploads').prepareCreate((record) => {
        record.localUri = localUri;
        record.mime = input.file.mimeType;
        record.fileName = input.file.name;
        record.bucket = PAGO_SUPPORT_BUCKET;
        record.negocioId = input.negocioId;
        record.pagoLocalId = input.pagoLocalId;
        record.pagoServerId = input.pagoServerId;
        record.status = 'pending';
        record.lastError = null;
      });
      await database.batch(
        created,
        prepareOutboxRecord(database, 'attach_pago_support', {
          fileUploadId: created.id,
          negocioId: input.negocioId,
          pagoLocalId: input.pagoLocalId || input.pagoServerId || '',
          lane: input.lane,
        })
      );
      return created;
    });
  } catch (error) {
    await deleteLocalPagoSupportFile(localUri);
    throw error;
  }

  void refreshPendingCount();
  void runSync('mutation');
  return upload;
}

export async function fetchRoutesFromLocal(): Promise<CollectionRouteSummary[] | null> {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  const [routes, stops] = await Promise.all([
    database.get<CollectionRouteRecord>('collection_routes').query().fetch(),
    database.get<CollectionRouteStopRecord>('collection_route_stops').query().fetch(),
  ]);
  return routes
    .sort((a, b) => b.routeDate.localeCompare(a.routeDate))
    .slice(0, 20)
    .map((route) => {
      const routeStops = stops.filter((stop) => stop.routeId === route.id);
      const completed = routeStops.filter((stop) => FINISHED_STOP_STATUSES.includes(stop.status)).length;
      return {
        id: route.id,
        route_date: route.routeDate,
        status: route.status as CollectionRouteSummary['status'],
        stop_count: routeStops.length,
        completed_count: completed,
        expected_total: route.totalExpected,
        collected_total: route.totalCollected,
      };
    });
}

export async function fetchRouteFromLocal(routeId: string): Promise<CollectionRoute | null> {
  if (!canUseLocalDb()) return null;
  try {
    const database = getDatabase();
    const route = await database.get<CollectionRouteRecord>('collection_routes').find(routeId);
    const stops = await database
      .get<CollectionRouteStopRecord>('collection_route_stops')
      .query(Q.where('route_id', routeId))
      .fetch();
    return {
      id: route.id,
      gestor_id: route.gestorId,
      route_date: route.routeDate,
      status: route.status as CollectionRoute['status'],
      started_at: route.startedAt,
      completed_at: route.completedAt,
      total_expected: route.totalExpected,
      total_collected: route.totalCollected,
      stops: stops
        .sort((a, b) => a.position - b.position)
        .map((stop) => ({
          id: stop.id,
          negocio_id: stop.negocioId,
          negocio_numero: stop.negocioNumero,
          position: stop.position,
          status: stop.status as CollectionRoute['stops'][number]['status'],
          customer_name: stop.customerName,
          customer_phone: stop.customerPhone,
          customer_address: stop.customerAddress,
          municipality_name: stop.municipalityName,
          expected_balance: stop.expectedBalance,
          payment_id: stop.paymentId,
          payment_amount: stop.paymentAmount,
          outcome_reason: stop.outcomeReason,
          notes: stop.notes,
          arrived_at: stop.arrivedAt,
          completed_at: stop.completedAt,
        })),
    };
  } catch {
    return null;
  }
}

export type RouteCommandInput =
  | { type: 'start_route'; routeId: string }
  | { type: 'finish_route'; routeId: string; cancel: boolean }
  | { type: 'select_route_stop'; stopId: string; routeId?: string | null }
  | {
      type: 'update_route_stop';
      stopId: string;
      routeId?: string | null;
      status: 'sin_pago' | 'reprogramado' | 'omitido';
      reason: string;
      notes: string | null;
    };

/**
 * Encola un comando de ruta y aplica su efecto en la base local para que la
 * pantalla refleje el cambio de inmediato (y no invite a repetir la acción).
 * El estado previo viaja como snapshot para poder revertirlo.
 */
export async function enqueueRouteCommand(input: RouteCommandInput) {
  if (!canUseLocalDb()) return false;
  const database = getDatabase();
  const nowIso = new Date().toISOString();
  const operations: Model[] = [];
  const snapshot: OptimisticSnapshot = { stops: [] };
  let routeId: string | null = 'routeId' in input && input.routeId ? input.routeId : null;

  const stop =
    input.type === 'select_route_stop' || input.type === 'update_route_stop'
      ? await findOrNull<CollectionRouteStopRecord>('collection_route_stops', input.stopId)
      : null;
  if (stop && !routeId) routeId = stop.routeId;
  const route = routeId ? await findOrNull<CollectionRouteRecord>('collection_routes', routeId) : null;

  const markStop = (
    record: CollectionRouteStopRecord,
    change: (row: CollectionRouteStopRecord) => void
  ) => {
    snapshot.stops!.push(snapshotStop(record));
    operations.push(
      record.prepareUpdate((row) => {
        change(row);
        row.rowSyncStatus = 'pending';
      })
    );
  };

  if (input.type === 'start_route' && route) {
    snapshot.route = snapshotRoute(route);
    operations.push(
      route.prepareUpdate((row) => {
        row.status = 'activa';
        row.startedAt = row.startedAt || nowIso;
        row.rowSyncStatus = 'pending';
      })
    );
    const first = await findNextPendingStop(route.id, '');
    if (first) {
      markStop(first, (row) => {
        row.status = 'actual';
        row.arrivedAt = row.arrivedAt || nowIso;
      });
    }
  }

  if (input.type === 'finish_route' && route) {
    snapshot.route = snapshotRoute(route);
    operations.push(
      route.prepareUpdate((row) => {
        row.status = input.cancel ? 'cancelada' : 'completada';
        row.completedAt = nowIso;
        row.rowSyncStatus = 'pending';
      })
    );
  }

  if (input.type === 'select_route_stop' && stop && stop.status === 'pendiente') {
    const currentStops = await database
      .get<CollectionRouteStopRecord>('collection_route_stops')
      .query(Q.where('route_id', stop.routeId), Q.where('status', 'actual'))
      .fetch();
    for (const current of currentStops) {
      markStop(current, (row) => {
        row.status = 'pendiente';
      });
    }
    markStop(stop, (row) => {
      row.status = 'actual';
      row.arrivedAt = row.arrivedAt || nowIso;
    });
  }

  if (input.type === 'update_route_stop' && stop) {
    markStop(stop, (row) => {
      row.status = input.status;
      row.outcomeReason = input.reason.trim();
      row.notes = input.notes?.trim() || null;
      row.arrivedAt = row.arrivedAt || nowIso;
      row.completedAt = nowIso;
    });
    const next = await findNextPendingStop(stop.routeId, stop.id);
    if (next) {
      markStop(next, (row) => {
        row.status = 'actual';
        row.arrivedAt = row.arrivedAt || nowIso;
      });
    }
  }

  const { type, ...rest } = input;
  const payload = { ...rest, routeId, snapshot };
  operations.push(prepareOutboxRecord(database, type, payload));

  await database.write(async () => {
    await database.batch(...operations);
  });
  void refreshPendingCount();
  void runSync('mutation');
  return true;
}

export type SyncQueueEntry = {
  id: string;
  type: OutboxCommandType;
  status: string;
  attempts: number;
  lastError: string | null;
  queuedAt: number;
  nextRetryAt: number;
  /** Texto corto para mostrar (monto, negocio, cliente). */
  summary: string;
};

function formatMoney(value: number) {
  return `$ ${Math.round(value).toLocaleString('es-CO')}`;
}

export async function listSyncQueue(): Promise<SyncQueueEntry[]> {
  if (!canUseLocalDb()) return [];
  const database = getDatabase();
  const items = await listReviewableOutbox(database);
  if (!items.length) return [];
  const negocios = await database.get<Negocio>('negocios').query().fetch();
  const numeroById = new Map(negocios.map((row) => [row.id, row.numero]));

  return items.map((item) => {
    const payload = parseOutboxPayload<Record<string, unknown>>(item);
    const negocioNumero = numeroById.get(String(payload.negocioId || ''));
    const negocioLabel = negocioNumero ? `negocio ${negocioNumero}` : 'negocio';
    let summary = '';
    switch (item.type as OutboxCommandType) {
      case 'register_pago':
      case 'register_route_pago':
        summary = `${formatMoney(Number(payload.amount || 0))} · ${negocioLabel}`;
        break;
      case 'create_customer':
        summary = `${String(payload.name || '')} · doc. ${String(payload.idNumber || '')}`;
        break;
      case 'attach_pago_support':
        summary = `Soporte de pago · ${negocioLabel}`;
        break;
      case 'update_route_stop':
        summary = `Visita ${String(payload.status || '')}`;
        break;
      case 'start_route':
        summary = 'Inicio de ruta';
        break;
      case 'finish_route':
        summary = payload.cancel ? 'Cancelación de ruta' : 'Cierre de ruta';
        break;
      case 'select_route_stop':
        summary = 'Selección de parada';
        break;
      default:
        summary = item.type;
    }
    return {
      id: item.id,
      type: item.type as OutboxCommandType,
      status: item.status,
      attempts: item.attempts,
      lastError: item.lastError,
      queuedAt: item.queuedAt,
      nextRetryAt: item.nextRetryAt,
      summary,
    };
  });
}

export async function retrySyncQueueItem(id: string) {
  const item = await findOrNull<SyncOutboxItem>('sync_outbox', id);
  if (!item) return;
  await getDatabase().write(async () => resetOutboxItem(item));
  void refreshPendingCount();
  void runSync('manual');
}

/** Descarta un comando y revierte su efecto local. */
export async function discardSyncQueueItem(id: string) {
  const database = getDatabase();
  const item = await findOrNull<SyncOutboxItem>('sync_outbox', id);
  if (!item) return;
  await database.write(async () => {
    const operations = await prepareRevertCommand(database, item, 'Descartado por el usuario');
    await markOutboxDiscarded(item, 'Descartado por el usuario');
    if (operations.length) await database.batch(...operations);
  });
  await refreshPendingCount();
}

export async function saveReportSnapshot(kind: string, payload: unknown) {
  if (!canUseLocalDb()) return;
  const database = getDatabase();
  const existing = await database.get<ReportSnapshot>('report_snapshots').query(Q.where('kind', kind)).fetch();
  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update((record) => {
        record.payloadJson = JSON.stringify(payload);
        record.pulledAt = Date.now();
      });
    } else {
      await database.get<ReportSnapshot>('report_snapshots').create((record) => {
        record.kind = kind;
        record.payloadJson = JSON.stringify(payload);
        record.pulledAt = Date.now();
      });
    }
  });
}

export async function loadReportSnapshot<T>(kind: string): Promise<{ payload: T; pulledAt: number } | null> {
  if (!canUseLocalDb()) return null;
  const rows = await getDatabase().get<ReportSnapshot>('report_snapshots').query(Q.where('kind', kind)).fetch();
  if (!rows[0]) return null;
  try {
    return { payload: JSON.parse(rows[0].payloadJson) as T, pulledAt: rows[0].pulledAt };
  } catch {
    return null;
  }
}
