import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { createIdempotencyKey } from '@/lib/idempotency';
import { MOBILE_PAYMENT_SITE } from '@/lib/paymentSite';
import { normalizePagoAmountForServer } from '@/lib/negocios/registerPagoRpc';
import type { Municipio } from '@/lib/cartera/carteraService';
import type { CarteraPageQuery, CarteraRow } from '@/lib/cartera/types';
import type { CollectionRoute, CollectionRouteSummary } from '@/lib/collection-routes/types';
import type { CustomerWithNegocios } from '@/lib/customers/customerNegocios';
import {
  DuplicateCustomerDocumentError,
  normalizeCustomerDocument,
} from '@/lib/customers/customerDocument';
import {
  countLocalCustomersBySeller,
  filterLocalCustomers,
  type LocalCustomerQuery,
  type LocalCustomerRow,
} from '@/lib/offline/domain/customersLocal';
import { databaseGeneration, getDatabase, isDatabaseOpen } from '../database';
import {
  CatalogDepartamento,
  CatalogMunicipio,
  CatalogPaymentMethod,
  CatalogVereda,
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  Customer,
  FileUpload,
  Negocio,
  NegocioCuota,
  NegocioItem,
  NegocioPago,
  Profile,
  ReportSnapshot,
  SyncOutboxItem,
} from '../models';
import {
  applyPagoToCuotas,
  emptyCarteraDashboard,
  filterCarteraCuotas,
  searchCustomersLocal,
  sortCarteraCuotas,
  summarizeCarteraFromCuotas,
} from '../domain/carteraLocal';
import {
  mapNegocioDetailFromLocal,
  mapNegociosListFromLocal,
  remainingForNegocio,
  type LocalNegocioListItem,
} from '../domain/negociosLocal';
import {
  listReviewableOutbox,
  markOutboxDiscarded,
  parseOutboxPayload,
  prepareOutboxRecord,
  resetOutboxItem,
} from '../sync/outbox';
import { PreparedChanges, prepareRevertCommand } from '../sync/reconcile';
import { prepareRejectedNegocio } from '../sync/negocioCreateCommand';
import {
  buildNegocioSyncStateMap,
  discardedNegocioIds,
  outboxAffectsNegocio,
  UNSETTLED_OUTBOX_STATUSES,
  type NegocioSyncState,
} from '../sync/negocioPendingSync';
import { refreshPendingCount, runSync } from '../sync/syncEngine';
import {
  laneForCommand,
  REJECTED_ROW_SYNC_STATUS,
  type CuotaSnapshot,
  type OptimisticSnapshot,
  type CreateNegocioPayload,
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
import { isNetworkError } from '../security/sessionPolicy';

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
  // Comparte la caché del directorio: son ~2.000 filas y el buscador se llama
  // en cada pulsación de tecla.
  return searchCustomersLocal(await readLocalCustomerRows(), term, limit);
}

/**
 * Caché del directorio local.
 *
 * Desde 20261122120000 el pull trae el directorio completo (~2.000 filas): leer
 * y mapear todas las filas en cada página de la lista (y otra vez para el
 * contador de la pestaña) se notaba al desplazarse. Se guarda el mapeo ya hecho
 * durante unos segundos; lo invalidan la creación de un cliente sin señal y una
 * descarga nueva.
 */
let customerRowsCache: { rows: LocalCustomerRow[]; at: number; generation: number } | null = null;
const CUSTOMER_ROWS_CACHE_MS = 5_000;

export function invalidateLocalCustomersCache() {
  customerRowsCache = null;
}

/** Filas del directorio local, para el módulo de clientes sin conexión. */
async function readLocalCustomerRows(): Promise<LocalCustomerRow[]> {
  const generation = databaseGeneration();
  if (
    customerRowsCache &&
    customerRowsCache.generation === generation &&
    Date.now() - customerRowsCache.at < CUSTOMER_ROWS_CACHE_MS
  ) {
    return customerRowsCache.rows;
  }
  const customers = await getDatabase().get<Customer>('customers').query().fetch();
  const rows = customers.map((row) => ({
    id: row.id,
    name: row.name,
    idNumber: row.idNumber,
    phone: row.phone,
    sellerId: row.sellerId ?? null,
    email: row.email ?? null,
    address: row.address ?? null,
    municipioId: row.municipioId ?? null,
    veredaId: row.veredaId ?? null,
  }));
  customerRowsCache = { rows, at: Date.now(), generation };
  return rows;
}

export async function fetchCustomersPageFromLocal(params: LocalCustomerQuery) {
  if (!canUseLocalDb()) return { items: [], totalCount: 0 };
  return filterLocalCustomers(await readLocalCustomerRows(), params);
}

/** Nombre visible de cada usuario descargado, por id. Vacío si no hay base local. */
/**
 * Nombre de una persona sin señal: el que viajó resuelto en el pull o, si no
 * está (negocio creado sin señal, datos viejos), el de los perfiles bajados.
 */
function localPersonName(
  resolved: string | null | undefined,
  id: string | null | undefined,
  profileNames: Map<string, string>
): string | null {
  if (resolved) return resolved;
  return id ? profileNames.get(id) ?? null : null;
}

export async function fetchProfileNamesFromLocal(): Promise<Map<string, string>> {
  if (!canUseLocalDb()) return new Map();
  const rows = await getDatabase().get<Profile>('profiles').query().fetch();
  return new Map(rows.map((row) => [row.id, row.fullName || row.email || 'Sin nombre']));
}

/** Nombres de municipios y veredas descargados, para completar la ficha del cliente. */
export async function fetchLocationNamesFromLocal(): Promise<{
  municipios: Map<string, { nombre: string; departamentoId: string | null }>;
  veredas: Map<string, string>;
  departamentos: Map<string, string>;
}> {
  if (!canUseLocalDb()) {
    return { municipios: new Map(), veredas: new Map(), departamentos: new Map() };
  }
  const database = getDatabase();
  const [municipios, veredas, departamentos] = await Promise.all([
    database.get<CatalogMunicipio>('catalog_municipios').query().fetch(),
    database.get<CatalogVereda>('catalog_veredas').query().fetch(),
    database.get<CatalogDepartamento>('catalog_departamentos').query().fetch(),
  ]);
  return {
    municipios: new Map(
      municipios.map((row) => [row.id, { nombre: row.nombre, departamentoId: row.departamentoId ?? null }])
    ),
    veredas: new Map(veredas.map((row) => [row.id, row.nombre])),
    departamentos: new Map(departamentos.map((row) => [row.id, row.nombre])),
  };
}

export async function countMyCustomersLocal(sellerId: string | null) {
  if (!canUseLocalDb() || !sellerId) return 0;
  return countLocalCustomersBySeller(await readLocalCustomerRows(), sellerId);
}

export async function fetchCustomerFromLocal(customerId: string): Promise<LocalCustomerRow | null> {
  if (!canUseLocalDb()) return null;
  const rows = await readLocalCustomerRows();
  return rows.find((row) => row.id === customerId) ?? null;
}

/** Negocios locales de un cliente concreto, para la ficha sin conexión. */
export async function fetchCustomerNegociosFromLocal(customerId: string): Promise<CustomerWithNegocios | null> {
  if (!canUseLocalDb()) return null;
  const customer = await fetchCustomerFromLocal(customerId);
  if (!customer) return null;
  const [result] = await buildCustomerNegocios([customer]);
  return result ?? null;
}

async function buildCustomerNegocios(
  matched: { id: string; name: string; idNumber: string | null; phone: string | null }[]
): Promise<CustomerWithNegocios[]> {
  const database = getDatabase();
  const [allNegocios, cuotas, discarded] = await Promise.all([
    database.get<Negocio>('negocios').query().fetch(),
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    loadDiscardedNegocioIds(database),
  ]);
  // Igual que en la lista de Negocios: el descartado por el usuario no sale.
  const negocios = withoutDiscarded(allNegocios, discarded);
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
          // Igual que en la lista: la mora se deriva de las cuotas locales, no
          // de un campo que sin señal llegaba en null.
          has_mora: cuotaRows.some(
            (cuota) => cuota.negocioId === negocio.id && cuota.status === 'mora'
          ),
        };
      }),
    };
  });
}

export async function createCustomerOffline(input: {
  name: string;
  idNumber: string;
  phone: string | null;
  /** Correo opcional, ya normalizado (recortado y en minúsculas). */
  email?: string | null;
  address?: string | null;
  municipioId?: string | null;
  veredaId?: string | null;
  /** Vendedor que crea el cliente. El servidor lo asigna igual por trigger al
   * sincronizar; aquí se adelanta para que aparezca ya en «Mis clientes». */
  sellerId?: string | null;
}) {
  const database = getDatabase();
  // Mismo criterio que el servidor (20261219120000): «1.234.567» y «1234567»
  // son el mismo documento. Se leen solo los candidatos que contienen su
  // último dígito o letra (sin comodines que escapar; LIKE no distingue
  // mayúsculas) y se comparan normalizados.
  const normalized = normalizeCustomerDocument(input.idNumber);
  if (normalized) {
    const candidates = await database
      .get<Customer>('customers')
      .query(Q.where('id_number', Q.like(`%${normalized.slice(-1)}%`)))
      .fetch();
    const existing = candidates.find((row) => normalizeCustomerDocument(row.idNumber) === normalized);
    if (existing) {
      throw new DuplicateCustomerDocumentError({
        id: existing.id,
        name: existing.name,
        id_number: existing.idNumber ?? input.idNumber,
        deleted: false,
      });
    }
  }
  const customerId = createIdempotencyKey();
  const idempotencyKey = createIdempotencyKey();
  const email = input.email?.trim().toLowerCase() || null;
  await database.write(async () => {
    await database.batch(
      database.get<Customer>('customers').prepareCreate((record) => {
        record._raw.id = customerId;
        record.name = input.name;
        record.idNumber = input.idNumber;
        record.phone = input.phone;
        record.email = email;
        record.sellerId = input.sellerId ?? null;
        // La ubicación también queda en local: el asistente de negocio la usa
        // para rellenar el paso de ubicación cuando se elige este cliente.
        record.address = input.address?.trim() || null;
        record.municipioId = input.municipioId || null;
        record.veredaId = input.veredaId || null;
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
          email,
          address: input.address ?? null,
          municipioId: input.municipioId ?? null,
          veredaId: input.veredaId ?? null,
        },
        idempotencyKey
      )
    );
  });
  // La lista de clientes lee de la caché del directorio: sin esto el cliente
  // recién creado no aparecería hasta pasados unos segundos.
  invalidateLocalCustomersCache();
  void refreshPendingCount();
  void runSync('mutation');
  return { id: customerId, name: input.name, id_number: input.idNumber };
}

/**
 * Comandos `create_negocio` de la cola en cualquier estado (también los
 * descartados, que `listReviewableOutbox` no trae). La cola nunca borra
 * filas, pero solo hay una por negocio creado sin señal: son pocas.
 */
async function listCreateNegocioOutbox(database: ReturnType<typeof getDatabase>) {
  const items = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('type', 'create_negocio'))
    .fetch();
  return items.map((item) => ({
    type: item.type,
    status: item.status,
    payload: parseOutboxPayload<Record<string, unknown>>(item),
  }));
}

/**
 * Negocios que el usuario descartó en «Cambios sin sincronizar»
 * (`discardedNegocioIds`). Siguen en el teléfono (el cliente ya firmó), pero
 * no deben salir en la lista, el buscador de clientes, la ficha ni la cartera.
 */
export async function loadDiscardedNegocioIds(database: ReturnType<typeof getDatabase>): Promise<Set<string>> {
  return discardedNegocioIds(await listCreateNegocioOutbox(database));
}

function withoutDiscarded<T extends { id: string }>(rows: T[], discarded: Set<string>): T[] {
  return discarded.size ? rows.filter((row) => !discarded.has(row.id)) : rows;
}

export async function fetchNegociosListFromLocal() {
  if (!canUseLocalDb()) return [];
  const database = getDatabase();
  // Los clientes salen de la caché del directorio (ya mapeados): leer y mapear
  // ~2.000 filas en cada búsqueda sin señal se notaba.
  const [allNegocios, customers, cuotas, createCommands] = await Promise.all([
    database.get<Negocio>('negocios').query().fetch(),
    readLocalCustomerRows(),
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    listCreateNegocioOutbox(database),
  ]);
  // Un negocio descartado por el usuario sigue en el teléfono, pero no en la lista.
  const negocios = withoutDiscarded(allNegocios, discardedNegocioIds(createCommands));
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

/**
 * Negocios creados en el teléfono que el servidor aún no confirma, para el
 * distintivo de la lista: `states` (id → pendiente/rechazado) y `items`, sus
 * filas ya con la forma de la lista (con señal la lista viene del servidor y
 * no los trae). Lee los `create_negocio` de la cola (la fuente de «Cambios sin
 * sincronizar») y solo las filas locales sin confirmar: una lectura para toda
 * la lista, no por tarjeta. Los descartados por el usuario quedan fuera.
 */
export async function loadNegocioSyncOverlay(): Promise<{
  states: Record<string, NegocioSyncState>;
  items: LocalNegocioListItem[];
}> {
  if (!canUseLocalDb()) return { states: {}, items: [] };
  const database = getDatabase();
  const [outbox, unsynced] = await Promise.all([
    // Los mismos comandos que «Cambios sin sincronizar», más los descartados
    // para poder excluirlos.
    listCreateNegocioOutbox(database),
    database.get<Negocio>('negocios').query(Q.where('sync_status', Q.notEq('synced'))).fetch(),
  ]);
  const states = buildNegocioSyncStateMap(
    outbox,
    unsynced.map((row) => ({ id: row.id, rowSyncStatus: row.rowSyncStatus }))
  );
  const rows = unsynced.filter((row) => states[row.id]);
  if (!rows.length) return { states, items: [] };
  const customerIds = [...new Set(rows.map((row) => row.customerId).filter(Boolean))];
  const [customers, cuotas] = await Promise.all([
    customerIds.length
      ? database.get<Customer>('customers').query(Q.where('id', Q.oneOf(customerIds))).fetch()
      : Promise.resolve([] as Customer[]),
    database
      .get<NegocioCuota>('negocio_cuotas')
      .query(Q.where('negocio_id', Q.oneOf(rows.map((row) => row.id))))
      .fetch(),
  ]);
  const items = mapNegociosListFromLocal(
    rows.map((row) => ({
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
    customers.map((row) => ({ id: row.id, name: row.name, idNumber: row.idNumber, phone: row.phone })),
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
  return { states, items };
}

/** Pago que el servidor no aceptó y que sigue guardado en el teléfono. */
export type RejectedPagoRow = {
  id: string;
  negocioId: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  paymentMethodName: string | null;
  createdByName: string | null;
  /** Motivo tal como lo devolvió el servidor. */
  rejectedReason: string | null;
  rejectedAt: number | null;
};

function toRejectedPagoRow(row: NegocioPago): RejectedPagoRow {
  return {
    id: row.id,
    negocioId: row.negocioId,
    amount: row.amount,
    paidAt: row.paidAt,
    receiptNumber: row.receiptNumber,
    paymentMethodName: row.paymentMethodName ?? null,
    createdByName: row.createdByName ?? null,
    rejectedReason: row.rejectedReason ?? null,
    rejectedAt: row.rejectedAt ?? null,
  };
}

function isRejectedPago(row: NegocioPago) {
  return row.rowSyncStatus === REJECTED_ROW_SYNC_STATUS;
}

/** Pagos rechazados de un negocio; se usan también cuando la pantalla carga del servidor. */
export async function listRejectedPagosFromLocal(negocioId: string): Promise<RejectedPagoRow[]> {
  if (!canUseLocalDb()) return [];
  const rows = await getDatabase()
    .get<NegocioPago>('negocio_pagos')
    .query(Q.where('negocio_id', negocioId))
    .fetch();
  return rows
    .filter(isRejectedPago)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .map(toRejectedPagoRow);
}

/**
 * Elimina del teléfono un pago rechazado. Solo se llama desde la acción
 * explícita de la persona: nunca lo hace la sincronización por su cuenta.
 */
export async function deleteRejectedPagoLocal(pagoId: string) {
  if (!canUseLocalDb()) return false;
  const database = getDatabase();
  const pago = await findOrNull<NegocioPago>('negocio_pagos', pagoId);
  if (!pago || !isRejectedPago(pago)) return false;
  // El comando rechazado que seguía en la cola se cierra con el pago: dejarlo
  // ahí mostraría un aviso de «rechazado» por un pago que ya no existe.
  const stuck = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', Q.oneOf(['failed', 'conflict'])))
    .fetch();
  await database.write(async () => {
    await pago.destroyPermanently();
    for (const item of stuck) {
      const payload = parseOutboxPayload<Record<string, unknown>>(item);
      if (String(payload.pagoLocalId || '') !== pagoId) continue;
      await markOutboxDiscarded(item, 'El usuario eliminó el pago no aceptado');
    }
  });
  await refreshPendingCount();
  return true;
}

export async function fetchNegocioDetailFromLocal(negocioId: string) {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  const negocio = await findOrNull<Negocio>('negocios', negocioId);
  if (!negocio) return null;
  // Solo el cliente y el fiador del negocio, no el directorio entero.
  const customerIds = [negocio.customerId, negocio.codeudorCustomerId].filter((value): value is string => Boolean(value));
  const [customers, cuotas, allPagos, items, profileNames] = await Promise.all([
    customerIds.length
      ? database.get<Customer>('customers').query(Q.where('id', Q.oneOf(customerIds))).fetch()
      : Promise.resolve([] as Customer[]),
    database.get<NegocioCuota>('negocio_cuotas').query(Q.where('negocio_id', negocioId)).fetch(),
    database.get<NegocioPago>('negocio_pagos').query(Q.where('negocio_id', negocioId)).fetch(),
    database.get<NegocioItem>('negocio_items').query(Q.where('negocio_id', negocioId)).fetch(),
    fetchProfileNamesFromLocal(),
  ]);
  // Vendedor al que pertenece el cliente, distinto del vendedor del negocio.
  const customerSellerId = customers.find((row) => row.id === negocio.customerId)?.sellerId ?? null;
  // Los rechazados van aparte: no son dinero recibido, así que no pueden sumar
  // en los totales ni en el saldo de los recibos.
  const pagos = allPagos.filter((row) => !isRejectedPago(row));
  const pendingIds = new Set(pagos.filter((row) => row.rowSyncStatus === 'pending').map((row) => row.id));
  const detail = mapNegocioDetailFromLocal({
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
      gestorCobroId: negocio.gestorCobroId,
      sellerName: negocio.sellerName,
      gestorCobroName: negocio.gestorCobroName,
      createdBy: negocio.createdBy,
      // Viaja resuelto en el pull (20261128120000). Un negocio creado sin señal
      // sólo guarda el id: su nombre sale de los perfiles descargados.
      createdByName: localPersonName(negocio.createdByName, negocio.createdBy, profileNames),
    },
    customers: customers.map((row) => ({
      id: row.id,
      name: row.name,
      idNumber: row.idNumber,
      phone: row.phone,
      email: row.email,
      address: row.address,
    })),
    items: items.map((row) => ({
      id: row.id,
      negocioId: row.negocioId,
      productId: row.productId,
      productName: row.productName,
      productSku: row.productSku,
      warehouseId: row.warehouseId,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      subtotal: row.subtotal,
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
      paymentMethodName: row.paymentMethodName,
      paymentSite: row.paymentSite,
      paymentKind: row.paymentKind,
      discountAmount: row.discountAmount,
      discountReason: row.discountReason,
      expectedTotal: row.expectedTotal,
    })),
  });
  return {
    ...detail,
    pagos: detail.pagos.map((pago) => ({
      // Marca para el recibo: mientras el pago siga en la cola, lo impreso
      // lleva la leyenda «PENDIENTE DE CONFIRMACIÓN».
      ...pago,
      pending_confirmation: pendingIds.has(pago.id),
    })),
    rejectedPagos: allPagos.filter(isRejectedPago).map(toRejectedPagoRow),
    customerSeller: {
      id: customerSellerId,
      name: localPersonName(null, customerSellerId, profileNames),
    },
  };
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

/** Espejo local del RPC `get_cartera_cuotas`, con los mismos filtros y orden. */
export async function fetchCarteraFromLocal(
  params: CarteraPageQuery
): Promise<{ rows: CarteraRow[]; totalCount: number } | null> {
  if (!canUseLocalDb()) return null;
  const database = getDatabase();
  const [allCuotas, negocios, customers, pagos, profileNames, discarded] = await Promise.all([
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    database.get<Negocio>('negocios').query().fetch(),
    database.get<Customer>('customers').query().fetch(),
    database.get<NegocioPago>('negocio_pagos').query().fetch(),
    // Los usuarios bajan completos en el pull: con ellos se nombran sin señal
    // el vendedor del cliente y quien registró el negocio.
    fetchProfileNamesFromLocal(),
    loadDiscardedNegocioIds(database),
  ]);
  // Las cuotas de un negocio descartado por el usuario no cuentan en la cartera.
  const cuotas = discarded.size ? allCuotas.filter((cuota) => !discarded.has(cuota.negocioId)) : allCuotas;
  const negocioById = new Map(negocios.map((row) => [row.id, row]));
  const customerById = new Map(customers.map((row) => [row.id, row]));
  // Métodos de pago con abonos vigentes por negocio: el RPC resuelve así el
  // filtro porque los abonos son FIFO y no quedan atados a una cuota.
  const methodsByNegocio = new Map<string, string[]>();
  for (const pago of pagos) {
    if (!pago.paymentMethodId) continue;
    if ((pago.receiptStatus || 'emitido') === 'anulado') continue;
    const current = methodsByNegocio.get(pago.negocioId);
    if (current) {
      if (!current.includes(pago.paymentMethodId)) current.push(pago.paymentMethodId);
    } else {
      methodsByNegocio.set(pago.negocioId, [pago.paymentMethodId]);
    }
  }
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
      customerSellerId: customer?.sellerId || null,
      gestorId: negocio?.gestorCobroId || null,
      negocioPaymentMethodIds: methodsByNegocio.get(cuota.negocioId) || [],
      installmentNumber: cuota.installmentNumber,
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
        seller_name: localPersonName(negocio?.sellerName, negocio?.sellerId, profileNames),
        customer_seller_id: customer?.sellerId || null,
        customer_seller_name: localPersonName(null, customer?.sellerId, profileNames),
        created_by: negocio?.createdBy || null,
        created_by_name: localPersonName(negocio?.createdByName, negocio?.createdBy, profileNames),
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
  const filtered = sortCarteraCuotas(filterCarteraCuotas(mapped, params));
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

export type LocalPaymentMethod = { id: string; name: string };

/** Métodos de pago descargados; `null` si no hay base local disponible. */
export async function fetchPaymentMethodsFromLocal(): Promise<LocalPaymentMethod[] | null> {
  if (!canUseLocalDb()) return null;
  const rows = await getDatabase().get<CatalogPaymentMethod>('catalog_payment_methods').query().fetch();
  return rows
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Registra un pago sin red: fila optimista + cuotas actualizadas + parada de
 * ruta (si aplica) + comando en el outbox, todo en un único batch atómico.
 * El snapshot previo viaja en el payload para poder revertir si el servidor
 * rechaza el pago de forma definitiva.
 */
/**
 * Elige el camino del cobro. Si el estado de conexión ya dice que no hay red,
 * se guarda directo en el teléfono: intentar el servidor primero deja al
 * cobrador esperando el tiempo límite completo con señal débil. Si hay red pero
 * la petición no llega (timeout, fallo de conexión), se cae al camino sin
 * conexión; cualquier otro error (una regla del servidor) se propaga.
 */
export async function registerPagoWithFallback<T>(input: {
  online: boolean;
  registerOnline: () => Promise<T>;
  registerOffline: () => Promise<T>;
}): Promise<T> {
  if (!input.online && canUseLocalDb()) return input.registerOffline();
  try {
    return await input.registerOnline();
  } catch (error) {
    if (!isNetworkError(error) || !canUseLocalDb()) throw error;
    return input.registerOffline();
  }
}

export async function registerPagoOffline(input: {
  negocioId: string;
  amount: number;
  paidAt: string;
  receiptNumber: string | null;
  /** Método de pago elegido en la pantalla de cobro. */
  paymentMethodId: string;
  paymentMethodName?: string | null;
  idempotencyKey?: string | null;
  routeStopId?: string | null;
  supportFile?: PagoSupportLocalFile | null;
  /** Nombre del usuario que registra el pago (para mostrarlo sin red). */
  registeredBy?: string | null;
}) {
  // A centavos, igual que el cobro con red: un entero no cambia (ni el hash de
  // idempotencia) y un valor con decimales no arrastra ruido de coma flotante.
  const amount = normalizePagoAmountForServer(input.amount);
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
    amount
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
    paymentMethodId: input.paymentMethodId,
    paymentSite: MOBILE_PAYMENT_SITE,
    negocioId: input.negocioId,
    amount,
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
        record.amount = amount;
        record.paidAt = input.paidAt;
        record.receiptNumber = input.receiptNumber;
        record.virtualReceiptNumber = null;
        record.receiptStatus = 'emitido';
        record.notes = null;
        record.createdByName = input.registeredBy || null;
        record.paymentMethodId = input.paymentMethodId;
        record.paymentMethodName = input.paymentMethodName || null;
        record.paymentSite = MOBILE_PAYMENT_SITE;
        // Sin conexión solo se registran abonos: el pronto pago exige red.
        record.paymentKind = 'abono';
        record.discountAmount = 0;
        record.discountReason = null;
        record.expectedTotal = null;
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
          record.paymentAmount = amount;
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

/**
 * ¿Quedan comandos sin confirmar que afecten al negocio (o a la parada/ruta
 * desde la que se cobra)? Sin base local no hay cola: devuelve false.
 */
export async function hasUnsettledSyncForNegocio(input: {
  negocioId: string;
  routeStopId?: string | null;
}): Promise<boolean> {
  if (!canUseLocalDb()) return false;
  const database = getDatabase();
  const stop = input.routeStopId
    ? await findOrNull<CollectionRouteStopRecord>('collection_route_stops', input.routeStopId)
    : null;
  const items = await database
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('status', Q.oneOf([...UNSETTLED_OUTBOX_STATUSES])))
    .fetch();
  return outboxAffectsNegocio(
    items.map((item) => ({
      type: item.type,
      status: item.status,
      payload: parseOutboxPayload<Record<string, unknown>>(item),
    })),
    { negocioId: input.negocioId, routeId: stop?.routeId ?? null, routeStopId: input.routeStopId ?? null }
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
  | {
      type: 'finish_route';
      routeId: string;
      cancel: boolean;
      /** Cerrar la jornada con paradas pendientes: quedan «No visitada». */
      closePending?: boolean;
      reason?: string | null;
    }
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
    if (!input.cancel && input.closePending) {
      // Lo mismo que hará el servidor: pendientes y actual → no visitada.
      const openStops = (
        await database
          .get<CollectionRouteStopRecord>('collection_route_stops')
          .query(Q.where('route_id', route.id))
          .fetch()
      ).filter((row) => row.status === 'pendiente' || row.status === 'actual');
      const reason = input.reason?.trim() || null;
      for (const open of openStops) {
        markStop(open, (row) => {
          row.status = 'no_visitada';
          row.outcomeReason = reason;
        });
      }
    }
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
        summary = payload.cancel
          ? 'Cancelación de ruta'
          : payload.closePending
            ? 'Cierre de jornada (pendientes como no visitadas)'
            : 'Cierre de ruta';
        break;
      case 'select_route_stop':
        summary = 'Selección de parada';
        break;
      case 'upload_negocio_signature':
        summary = `Firma (${String(payload.role || 'cliente')}) · ${negocioLabel}`;
        break;
      case 'create_negocio':
        // El número lo asigna el servidor: hasta entonces se identifica por el
        // cliente y el valor del negocio.
        summary = `${String(payload.customerName || 'Cliente')} · ${formatMoney(Number(payload.totalCredit || 0))}`;
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
  // Reintentar sólo sube la cola: bajar datos es cosa de «Descargar».
  void runSync('retry');
}

/** Descarta un comando y revierte su efecto local. */
export async function discardSyncQueueItem(id: string) {
  const database = getDatabase();
  const item = await findOrNull<SyncOutboxItem>('sync_outbox', id);
  if (!item) return;
  await database.write(async () => {
    const changes = new PreparedChanges();
    // Un negocio descartado no desaparece del teléfono: queda marcado con el
    // motivo, igual que si lo hubiera rechazado el servidor. El cliente ya
    // firmó el contrato y alguien tiene que decidir qué hacer con él.
    if (item.type === 'create_negocio') {
      await prepareRejectedNegocio(
        database,
        parseOutboxPayload<CreateNegocioPayload>(item),
        'Descartado por el usuario',
        changes
      );
    }
    const operations = await prepareRevertCommand(database, item, 'Descartado por el usuario', changes);
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

/** Línea de producto de un negocio guardada en el teléfono. */
export type LocalNegocioProductRow = {
  negocioId: string;
  productName: string | null;
  productSku: string | null;
  description: string | null;
  quantity: number;
};

/** Productos de varios negocios a la vez (ficha del cliente sin señal). */
export async function fetchNegociosProductsFromLocal(negocioIds: readonly string[]): Promise<LocalNegocioProductRow[]> {
  if (!canUseLocalDb() || negocioIds.length === 0) return [];
  const rows = await getDatabase()
    .get<NegocioItem>('negocio_items')
    .query(Q.where('negocio_id', Q.oneOf([...negocioIds])))
    .fetch();
  return rows.map((row) => ({
    negocioId: row.negocioId,
    productName: row.productName,
    productSku: row.productSku,
    description: row.description,
    quantity: Number(row.quantity) || 0,
  }));
}
