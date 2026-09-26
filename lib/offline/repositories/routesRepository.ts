/**
 * Rutas de cobro en la base local: candidatos sin señal, copia guardada de una
 * ruta y comprobación de que se puede trabajar sin señal.
 *
 * Solo toca las tablas de rutas (`collection_routes`, `collection_route_stops`)
 * y LEE negocios, cuotas, clientes y maestros de ubicación.
 */
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import {
  buildLocalCandidates,
  type LocalCandidateSource,
} from '@/lib/collection-routes/candidates';
import type { LocalRouteSnapshot } from '@/lib/collection-routes/routeOffline';
import type { CandidateQuery, CollectionRoute } from '@/lib/collection-routes/types';
import { getDatabase, isDatabaseOpen } from '../database';
import type {
  CollectionRouteRecord,
  CollectionRouteStopRecord,
  Customer,
  Negocio,
  NegocioCuota,
} from '../models';
import { fetchLocationCatalogsFromLocal } from './catalogRepository';

async function findOrNull<T extends Model>(table: string, id: string): Promise<T | null> {
  try {
    return await getDatabase().get<T>(table).find(id);
  } catch {
    return null;
  }
}

/**
 * Candidatos para armar la ruta con lo descargado. `null` si no hay base
 * local (la pantalla dice entonces que hace falta señal).
 */
export async function fetchRouteCandidatesFromLocal(input: {
  userId: string;
  today: string;
  query: CandidateQuery;
  page: number;
  pageSize: number;
}) {
  if (!isDatabaseOpen()) return null;
  const database = getDatabase();
  const negocios = await database
    .get<Negocio>('negocios')
    .query(Q.where('gestor_cobro_id', input.userId), Q.where('status', Q.oneOf(['activo', 'entregado'])))
    .fetch();
  const negocioIds = negocios.map((row) => row.id);
  const customerIds = Array.from(new Set(negocios.map((row) => row.customerId)));
  const [cuotas, customers, names] = await Promise.all([
    negocioIds.length
      ? database.get<NegocioCuota>('negocio_cuotas').query(Q.where('negocio_id', Q.oneOf(negocioIds))).fetch()
      : Promise.resolve([] as NegocioCuota[]),
    customerIds.length
      ? database.get<Customer>('customers').query(Q.where('id', Q.oneOf(customerIds))).fetch()
      : Promise.resolve([] as Customer[]),
    fetchLocationCatalogsFromLocal(),
  ]);
  const customersById = new Map(customers.map((row) => [row.id, row]));
  const cuotasByNegocio = new Map<string, NegocioCuota[]>();
  for (const cuota of cuotas) {
    const list = cuotasByNegocio.get(cuota.negocioId) || [];
    list.push(cuota);
    cuotasByNegocio.set(cuota.negocioId, list);
  }
  const sources: LocalCandidateSource[] = negocios.map((negocio) => {
    const customer = customersById.get(negocio.customerId);
    return {
      negocio: {
        id: negocio.id,
        numero: Number(negocio.numero || 0),
        status: negocio.status,
        gestorCobroId: negocio.gestorCobroId,
        direccion: negocio.direccion,
        municipioId: negocio.municipioId,
        veredaId: negocio.veredaId ?? null,
        customerId: negocio.customerId,
      },
      customer: customer
        ? {
            name: customer.name,
            idNumber: customer.idNumber,
            phone: customer.phone,
            municipioId: customer.municipioId,
            veredaId: customer.veredaId,
          }
        : null,
      cuotas: (cuotasByNegocio.get(negocio.id) || []).map((cuota) => ({
        dueDate: cuota.dueDate,
        amount: Number(cuota.amount || 0),
        paidAmount: Number(cuota.paidAmount || 0),
        lateFeeAmount: Number(cuota.lateFeeAmount || 0),
        status: cuota.status,
      })),
    };
  });
  return buildLocalCandidates(sources, { ...input, names });
}

/**
 * Qué hay de la ruta en el teléfono: la ruta, sus paradas en orden y cuáles
 * de sus negocios se pueden cobrar sin señal (negocio + cliente + cuotas).
 */
export async function readRouteLocalSnapshot(routeId: string): Promise<LocalRouteSnapshot> {
  const empty: LocalRouteSnapshot = { routeExists: false, stopNegocioIds: [], readyNegocioIds: new Set() };
  if (!isDatabaseOpen()) return empty;
  const database = getDatabase();
  const route = await findOrNull<CollectionRouteRecord>('collection_routes', routeId);
  if (!route) return empty;
  const stops = await database
    .get<CollectionRouteStopRecord>('collection_route_stops')
    .query(Q.where('route_id', routeId))
    .fetch();
  const stopNegocioIds = [...stops].sort((a, b) => a.position - b.position).map((stop) => stop.negocioId);
  const readyNegocioIds = new Set<string>();
  if (stopNegocioIds.length) {
    const [negocios, cuotas] = await Promise.all([
      database.get<Negocio>('negocios').query(Q.where('id', Q.oneOf(stopNegocioIds))).fetch(),
      database.get<NegocioCuota>('negocio_cuotas').query(Q.where('negocio_id', Q.oneOf(stopNegocioIds))).fetch(),
    ]);
    const customerIds = Array.from(new Set(negocios.map((row) => row.customerId)));
    const customers = customerIds.length
      ? await database.get<Customer>('customers').query(Q.where('id', Q.oneOf(customerIds))).fetch()
      : [];
    const customerSet = new Set(customers.map((row) => row.id));
    const withCuotas = new Set(cuotas.map((row) => row.negocioId));
    for (const negocio of negocios) {
      if (customerSet.has(negocio.customerId) && withCuotas.has(negocio.id)) readyNegocioIds.add(negocio.id);
    }
  }
  return { routeExists: true, stopNegocioIds, readyNegocioIds };
}

/**
 * Deja la copia local de la ruta igual a la del servidor: ruta, paradas
 * (altas, cambios de orden y estado) y bajas de paradas quitadas, que la
 * descarga no borra. Las filas con un cambio sin confirmar (`pending`) no se
 * tocan: el comando en cola manda.
 *
 * Con `onlyIfSaved` (la ruta se abrió con señal) solo actualiza una ruta que
 * el gestor ya había descargado: nada nuevo baja al teléfono sin pedirlo.
 * Devuelve true si la ruta quedó guardada.
 */
export async function saveRouteCopyLocally(route: CollectionRoute, options: { onlyIfSaved: boolean }) {
  if (!isDatabaseOpen()) return false;
  const database = getDatabase();
  const existing = await findOrNull<CollectionRouteRecord>('collection_routes', route.id);
  if (!existing && options.onlyIfSaved) return false;

  const operations: Model[] = [];
  const applyRoute = (record: CollectionRouteRecord) => {
    record.gestorId = route.gestor_id;
    record.routeDate = route.route_date;
    record.status = route.status;
    record.startedAt = route.started_at;
    record.completedAt = route.completed_at;
    record.totalExpected = route.total_expected;
    record.totalCollected = route.total_collected;
    record.rowSyncStatus = 'synced';
  };
  if (!existing) {
    operations.push(
      database.get<CollectionRouteRecord>('collection_routes').prepareCreate((record) => {
        record._raw.id = route.id;
        applyRoute(record);
        record.serverUpdatedAt = null;
      })
    );
  } else if (existing.rowSyncStatus !== 'pending') {
    operations.push(existing.prepareUpdate(applyRoute));
  }

  const localStops = await database
    .get<CollectionRouteStopRecord>('collection_route_stops')
    .query(Q.where('route_id', route.id))
    .fetch();
  const localById = new Map(localStops.map((row) => [row.id, row]));
  const serverIds = new Set(route.stops.map((stop) => stop.id));

  for (const stop of route.stops) {
    const apply = (record: CollectionRouteStopRecord) => {
      record.routeId = route.id;
      record.negocioId = stop.negocio_id;
      record.negocioNumero = stop.negocio_numero;
      record.position = stop.position;
      record.status = stop.status;
      record.customerName = stop.customer_name;
      record.customerPhone = stop.customer_phone;
      record.customerAddress = stop.customer_address;
      record.municipalityName = stop.municipality_name;
      record.expectedBalance = stop.expected_balance;
      record.paymentId = stop.payment_id;
      record.paymentAmount = stop.payment_amount;
      record.outcomeReason = stop.outcome_reason;
      record.notes = stop.notes;
      record.arrivedAt = stop.arrived_at;
      record.completedAt = stop.completed_at;
      record.rowSyncStatus = 'synced';
    };
    const local = localById.get(stop.id);
    if (!local) {
      operations.push(
        database.get<CollectionRouteStopRecord>('collection_route_stops').prepareCreate((record) => {
          record._raw.id = stop.id;
          apply(record);
          record.serverUpdatedAt = null;
        })
      );
    } else if (local.rowSyncStatus !== 'pending') {
      operations.push(local.prepareUpdate(apply));
    }
  }
  for (const local of localStops) {
    if (!serverIds.has(local.id) && local.rowSyncStatus !== 'pending') {
      operations.push(local.prepareDestroyPermanently());
    }
  }

  if (operations.length) {
    await database.write(async () => {
      await database.batch(...operations);
    });
  }
  return true;
}
