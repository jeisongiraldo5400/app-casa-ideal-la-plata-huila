import { supabase } from '@/lib/supabase';
import { bogotaDateValue } from '@/lib/localDate';
import { getDatabase } from '@/lib/offline/database';
import {
  CatalogDepartamento,
  CatalogMunicipio,
  CatalogVereda,
  Customer,
  Negocio,
  NegocioCuota,
} from '@/lib/offline/models';
import {
  canUseLocalDb,
  fetchNegociosListFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import {
  EMPTY_LOCATION_MASTERS,
  fetchLocationMasters,
  type LocationMasters,
} from '@/lib/locations/locationsService';
import {
  buildLocalNegocioEntry,
  mapServerNegocioRow,
  mapServerSummary,
  queryLocalNegocios,
  type LocalCuotaInput,
  type LocalListQuery,
  type LocalNegocioEntry,
  type NegocioListRow,
  type NegociosListFilters,
  type NegociosListSummary,
  type NegociosScope,
} from '@/lib/negocios/negociosListQuery';

export type NegociosPageParams = {
  scope: NegociosScope;
  gestorId: string | null;
  search: string;
  filters: NegociosListFilters;
  limit: number;
  offset: number;
};

export type NegociosPage = {
  rows: NegocioListRow[];
  summary: NegociosListSummary;
};

/** Una página de la lista, filtrada y resumida en el servidor (20261209120000). */
export async function fetchNegociosPage(params: NegociosPageParams): Promise<NegociosPage> {
  const { filters } = params;
  const { data, error } = await supabase.rpc('list_negocios_movil', {
    p_scope: params.scope,
    p_gestor_id: params.scope === 'por_cobrar' && params.gestorId ? params.gestorId : undefined,
    p_search: params.search.trim(),
    p_departamento_id: filters.departamentoId || undefined,
    p_municipio_id: filters.municipioId || undefined,
    p_vereda_id: filters.veredaId || undefined,
    p_status: filters.status,
    p_cobro: filters.cobro,
    p_days: filters.days,
    p_order: filters.order,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw error;
  const payload = (data ?? {}) as { rows?: Record<string, unknown>[]; summary?: unknown };
  return {
    rows: (payload.rows ?? []).map(mapServerNegocioRow),
    summary: mapServerSummary(payload.summary),
  };
}

/**
 * Negocios del teléfono con lo necesario para filtrarlos como el servidor.
 * La base es `fetchNegociosListFromLocal` (ya descarta los negocios que el
 * usuario desechó en la cola); aquí se completan gestor, ubicación y cuotas.
 */
async function readLocalEntries(today: string): Promise<LocalNegocioEntry[]> {
  const database = getDatabase();
  const [base, negocios, customers, cuotas, municipios, veredas, departamentos] = await Promise.all([
    fetchNegociosListFromLocal(),
    database.get<Negocio>('negocios').query().fetch(),
    database.get<Customer>('customers').query().fetch(),
    database.get<NegocioCuota>('negocio_cuotas').query().fetch(),
    database.get<CatalogMunicipio>('catalog_municipios').query().fetch(),
    database.get<CatalogVereda>('catalog_veredas').query().fetch(),
    database.get<CatalogDepartamento>('catalog_departamentos').query().fetch(),
  ]);
  const negocioById = new Map(negocios.map((row) => [row.id, row]));
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const cuotasByNegocio = new Map<string, LocalCuotaInput[]>();
  for (const cuota of cuotas) {
    const list = cuotasByNegocio.get(cuota.negocioId) ?? [];
    list.push({
      dueDate: cuota.dueDate,
      installmentNumber: cuota.installmentNumber,
      amount: cuota.amount,
      paidAmount: cuota.paidAmount,
      lateFeeAmount: cuota.lateFeeAmount,
      status: cuota.status,
    });
    cuotasByNegocio.set(cuota.negocioId, list);
  }
  const names = {
    municipios: new Map(municipios.map((row) => [row.id, { nombre: row.nombre, departamentoId: row.departamentoId ?? null }])),
    veredas: new Map(veredas.map((row) => [row.id, row.nombre])),
    departamentos: new Map(departamentos.map((row) => [row.id, row.nombre])),
  };

  return base.map((item) => {
    const negocio = negocioById.get(item.id);
    const customer = customerById.get(item.customer_id);
    return buildLocalNegocioEntry(
      {
        id: item.id,
        numero: item.numero,
        status: item.status,
        dealDate: item.deal_date,
        installmentsCount: item.installments_count,
        totalCredit: item.total_credit,
        customerId: item.customer_id,
        customerName: item.customer?.name ?? null,
        customerIdNumber: item.customer?.id_number ?? null,
        sellerId: item.seller_id,
        createdBy: negocio?.createdBy ?? null,
        gestorCobroId: negocio?.gestorCobroId ?? null,
        deliveryOrderId: item.delivery_order_id,
        negocioMunicipioId: negocio?.municipioId ?? null,
        negocioAddress: negocio?.direccion ?? null,
        negocioVeredaId: negocio?.veredaId ?? null,
        customerMunicipioId: customer?.municipioId ?? null,
        customerVeredaId: customer?.veredaId ?? null,
        customerAddress: customer?.address ?? null,
        cuotas: cuotasByNegocio.get(item.id) ?? [],
        storedBalance: item.remaining_balance,
      },
      today,
      names
    );
  });
}

/** La lista sin señal, con los mismos filtros. Null si no hay base local. */
export async function fetchNegociosFromLocal(
  query: Omit<LocalListQuery, 'today'>
): Promise<NegociosPage | null> {
  if (!canUseLocalDb()) return null;
  const today = bogotaDateValue();
  return queryLocalNegocios(await readLocalEntries(today), { ...query, today });
}

/** Maestros de ubicación descargados, para el filtro sin señal. */
export async function fetchLocationMastersFromLocal(): Promise<LocationMasters> {
  if (!canUseLocalDb()) return EMPTY_LOCATION_MASTERS;
  const database = getDatabase();
  const [departamentos, municipios, veredas] = await Promise.all([
    database.get<CatalogDepartamento>('catalog_departamentos').query().fetch(),
    database.get<CatalogMunicipio>('catalog_municipios').query().fetch(),
    database.get<CatalogVereda>('catalog_veredas').query().fetch(),
  ]);
  const byName = <T extends { nombre: string }>(a: T, b: T) => a.nombre.localeCompare(b.nombre);
  return {
    departamentos: departamentos
      .filter((row) => row.isActive)
      .map((row) => ({ id: row.id, nombre: row.nombre }))
      .sort(byName),
    municipios: municipios
      .filter((row) => row.isActive)
      .map((row) => ({ id: row.id, nombre: row.nombre, departamento_id: row.departamentoId ?? '' }))
      .sort(byName),
    veredas: veredas
      .filter((row) => row.isActive)
      .map((row) => ({ id: row.id, nombre: row.nombre, municipio_id: row.municipioId }))
      .sort(byName),
  };
}

/** Maestros de ubicación: del servidor y, si falla, los descargados. */
export async function loadLocationMastersForList(): Promise<LocationMasters> {
  try {
    return await fetchLocationMasters();
  } catch {
    return fetchLocationMastersFromLocal();
  }
}
