import { Q } from '@nozbe/watermelondb';
import * as FileSystem from 'expo-file-system/legacy';
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
} from '../models';
import {
  applyPagoToCuotas,
  emptyCarteraDashboard,
  filterCarteraCuotas,
  searchCustomersLocal,
  summarizeCarteraFromCuotas,
} from '../domain/carteraLocal';
import { mapNegocioDetailFromLocal, mapNegociosListFromLocal } from '../domain/negociosLocal';
import { enqueueOutbox } from '../sync/outbox';
import { runSync } from '../sync/syncEngine';
import type { PagoSupportLocalFile } from '@/lib/uploadPagoSupport';
import { PAGO_SUPPORT_BUCKET } from '@/lib/uploadPagoSupport';

export function canUseLocalDb() {
  return isDatabaseOpen();
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
        const remaining = cuotas
          .filter((cuota) => cuota.negocioId === negocio.id && cuota.status !== 'anulada')
          .reduce(
            (sum, cuota) =>
              sum + Math.max(cuota.amount + cuota.lateFeeAmount - cuota.paidAmount, 0),
            0
          );
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
          remaining_balance: remaining || negocio.remainingBalance,
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
    await database.get<Customer>('customers').create((record) => {
      record._raw.id = customerId;
      record.name = input.name;
      record.idNumber = input.idNumber;
      record.phone = input.phone;
      record.rowSyncStatus = 'pending';
      record.localUpdatedAt = Date.now();
      record.serverUpdatedAt = null;
    });
  });
  await enqueueOutbox(
    database,
    'create_customer',
    {
      customerId,
      name: input.name,
      idNumber: input.idNumber,
      phone: input.phone,
    },
    idempotencyKey
  );
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
  let negocio: Negocio;
  try {
    negocio = await database.get<Negocio>('negocios').find(negocioId);
  } catch {
    return null;
  }
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

export async function registerPagoOffline(input: {
  negocioId: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  routeStopId?: string | null;
  supportFile?: PagoSupportLocalFile | null;
}) {
  const database = getDatabase();
  const pagoLocalId = createIdempotencyKey();
  const idempotencyKey = createIdempotencyKey();
  const cuotas = await database
    .get<NegocioCuota>('negocio_cuotas')
    .query(Q.where('negocio_id', input.negocioId))
    .fetch();
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

  await database.write(async () => {
    await database.get<NegocioPago>('negocio_pagos').create((record) => {
      record._raw.id = pagoLocalId;
      record.negocioId = input.negocioId;
      record.cuotaId = null;
      record.amount = input.amount;
      record.paidAt = input.paidAt;
      record.receiptNumber = input.receiptNumber;
      record.virtualReceiptNumber = null;
      record.receiptStatus = 'emitido';
      record.notes = null;
      record.rowSyncStatus = 'pending';
      record.serverUpdatedAt = null;
    });
    for (const cuota of applied.cuotas) {
      const local = cuotas.find((row) => row.id === cuota.id);
      if (!local) continue;
      await local.update((record) => {
        record.paidAmount = cuota.paidAmount;
        record.status = cuota.status;
        record.rowSyncStatus = 'pending';
      });
    }
    const negocio = await database.get<Negocio>('negocios').find(input.negocioId);
    await negocio.update((record) => {
      record.remainingBalance = applied.remainingBalance;
    });
    if (input.routeStopId) {
      try {
        const stop = await database.get<CollectionRouteStopRecord>('collection_route_stops').find(input.routeStopId);
        await stop.update((record) => {
          record.status = 'cobrado';
          record.paymentId = pagoLocalId;
          record.paymentAmount = input.amount;
          record.completedAt = new Date().toISOString();
          record.rowSyncStatus = 'pending';
        });
      } catch {
        // Stop may not be cached yet.
      }
    }
  });

  if (input.supportFile) {
    const destDir = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ''}pago-soportes`;
    const dest = `${destDir}/${pagoLocalId}-${input.supportFile.name}`;
    await FileSystem.makeDirectoryAsync(destDir, {
      intermediates: true,
    }).catch(() => undefined);
    await FileSystem.copyAsync({ from: input.supportFile.uri, to: dest });
    await database.write(async () => {
      await database.get<FileUpload>('file_uploads').create((record) => {
        record.localUri = dest;
        record.mime = input.supportFile!.mimeType;
        record.fileName = input.supportFile!.name;
        record.bucket = PAGO_SUPPORT_BUCKET;
        record.negocioId = input.negocioId;
        record.pagoLocalId = pagoLocalId;
        record.pagoServerId = null;
        record.status = 'pending';
        record.lastError = null;
      });
    });
    const uploads = await database.get<FileUpload>('file_uploads').query().fetch();
    const created = uploads.find((row) => row.pagoLocalId === pagoLocalId);
    if (created) {
      await enqueueOutbox(database, 'attach_pago_support', {
        fileUploadId: created.id,
        negocioId: input.negocioId,
        pagoLocalId,
      });
    }
  }

  await enqueueOutbox(
    database,
    input.routeStopId ? 'register_route_pago' : 'register_pago',
    {
      pagoLocalId,
      negocioId: input.negocioId,
      amount: input.amount,
      paidAt: input.paidAt,
      receiptNumber: input.receiptNumber,
      notes: null,
      routeStopId: input.routeStopId || null,
    },
    idempotencyKey
  );
  void runSync('mutation');
  return { pagoLocalId, pendingReceipt: true };
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
      const completed = routeStops.filter((stop) =>
        ['cobrado', 'sin_pago', 'reprogramado', 'omitido'].includes(stop.status)
      ).length;
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

export async function enqueueRouteCommand(
  type: 'start_route' | 'finish_route' | 'select_route_stop' | 'update_route_stop',
  payload: Record<string, unknown>
) {
  if (!canUseLocalDb()) return false;
  await enqueueOutbox(getDatabase(), type, payload);
  void runSync('mutation');
  return true;
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
