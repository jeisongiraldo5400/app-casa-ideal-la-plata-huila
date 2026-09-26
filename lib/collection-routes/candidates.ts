import { negocioVeredaLocal } from '@/lib/negocios/negociosListQuery';
import { matchesNormalized, normalizeDigits } from '@/lib/search/normalizeText';
import type {
  CandidateFilter,
  CandidateQuery,
  CollectionRouteCandidate,
  RouteLocationFilter,
} from './types';

/** Filtros de estado que ofrece la pantalla, en el orden en que se muestran. */
export const CANDIDATE_FILTER_OPTIONS: { value: CandidateFilter; label: string }[] = [
  { value: 'todas', label: 'Todos' },
  { value: 'vencidas', label: 'En mora' },
  { value: 'pronto', label: 'Vence pronto' },
  { value: 'al_dia', label: 'Al día' },
];

/** Días que cuentan como «vence pronto» (igual que el servidor). */
export const DUE_SOON_DAYS = 7;

/** Máximo de paradas de una ruta (lo valida también el servidor). */
export const MAX_ROUTE_STOPS = 200;

export function countActiveLocationFilters(filter: RouteLocationFilter): number {
  return [filter.departamentoId, filter.municipioId, filter.veredaId].filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Selección
// ---------------------------------------------------------------------------

export type SelectableStop = Pick<
  CollectionRouteCandidate,
  'negocio_id' | 'negocio_numero' | 'customer_name' | 'customer_address'
> & {
  municipality_name?: string | null;
  vereda_name?: string | null;
  expected_balance?: number;
  /** Visita ya atendida en una ruta en curso: no se puede quitar. */
  locked?: boolean;
};

export function isSelected(selected: SelectableStop[], negocioId: string) {
  return selected.some((item) => item.negocio_id === negocioId);
}

/** Agrega o quita un negocio. Los bloqueados no se quitan. */
export function toggleSelection<T extends SelectableStop>(selected: T[], candidate: T): T[] {
  const current = selected.find((item) => item.negocio_id === candidate.negocio_id);
  if (current) {
    if (current.locked) return selected;
    return selected.filter((item) => item.negocio_id !== candidate.negocio_id);
  }
  return [...selected, candidate];
}

/** Agrega al final los que falten (conserva el orden ya armado) sin pasar del tope. */
export function addAllToSelection<T extends SelectableStop>(selected: T[], candidates: T[], max = MAX_ROUTE_STOPS): T[] {
  const next = [...selected];
  for (const candidate of candidates) {
    if (next.length >= max) break;
    if (!next.some((item) => item.negocio_id === candidate.negocio_id)) next.push(candidate);
  }
  return next;
}

/** Quita los indicados, salvo los bloqueados. */
export function removeFromSelection<T extends SelectableStop>(selected: T[], negocioIds: string[]): T[] {
  const ids = new Set(negocioIds);
  return selected.filter((item) => item.locked || !ids.has(item.negocio_id));
}

// ---------------------------------------------------------------------------
// Candidatos sin señal (lo descargado en el teléfono)
// ---------------------------------------------------------------------------

export type LocalCandidateSource = {
  negocio: {
    id: string;
    numero: number;
    status: string;
    gestorCobroId: string | null;
    direccion: string | null;
    municipioId: string | null;
    /** Vereda propia del negocio (null si no tiene o si bajó antes de v12). */
    veredaId?: string | null;
    customerId: string;
  };
  customer: {
    name: string;
    idNumber: string | null;
    phone: string | null;
    municipioId: string | null;
    veredaId: string | null;
  } | null;
  cuotas: {
    dueDate: string;
    amount: number;
    paidAmount: number;
    lateFeeAmount: number;
    status: string;
  }[];
};

export type LocationNames = {
  departamentos: { id: string; nombre: string }[];
  municipios: { id: string; nombre: string; departamento_id: string }[];
  veredas: { id: string; nombre: string; municipio_id: string }[];
};

const COLLECTABLE_NEGOCIO_STATUSES = ['activo', 'entregado'];
const OPEN_CUOTA_STATUSES = ['pendiente', 'parcial', 'mora'];

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesFilter(filter: CandidateFilter, dueDates: string[], today: string) {
  const overdue = dueDates.some((due) => due < today);
  switch (filter) {
    case 'vencidas':
      return overdue;
    case 'hoy':
      return dueDates.some((due) => due <= today);
    case 'al_dia':
      return !overdue;
    case 'pronto': {
      const limit = addDays(today, DUE_SOON_DAYS);
      return !overdue && dueDates.some((due) => due <= limit);
    }
    default:
      return true;
  }
}

/**
 * Espejo de `get_collection_route_candidates` sobre lo descargado: los
 * negocios asignados al gestor, activos o entregados, con saldo; misma
 * ubicación (la del negocio y, si no tiene, la del cliente), mismos filtros y
 * mismo orden (próximo vencimiento, número).
 *
 * Vereda: la propia del negocio y, si no tiene, la del cliente cuando el
 * negocio no tiene municipio o es el mismo del cliente (como el servidor).
 */
export function buildLocalCandidates(
  sources: LocalCandidateSource[],
  input: {
    userId: string;
    today: string;
    query: CandidateQuery;
    names: LocationNames;
    page: number;
    pageSize: number;
  }
): { rows: CollectionRouteCandidate[]; totalCount: number } {
  const { query, today, names } = input;
  const municipios = new Map(names.municipios.map((row) => [row.id, row]));
  const departamentos = new Map(names.departamentos.map((row) => [row.id, row]));
  const veredas = new Map(names.veredas.map((row) => [row.id, row]));
  const searchDigits = normalizeDigits(query.search);

  const matches: CollectionRouteCandidate[] = [];
  for (const { negocio, customer, cuotas } of sources) {
    if (negocio.gestorCobroId !== input.userId) continue;
    if (!COLLECTABLE_NEGOCIO_STATUSES.includes(negocio.status)) continue;
    if (!customer) continue;

    const open = cuotas.filter((cuota) => OPEN_CUOTA_STATUSES.includes(cuota.status));
    const pending = (cuota: LocalCandidateSource['cuotas'][number]) =>
      Math.max(cuota.amount + (cuota.lateFeeAmount || 0) - cuota.paidAmount, 0);
    const expected = open.reduce((sum, cuota) => sum + pending(cuota), 0);
    if (!open.length || expected <= 0) continue;
    const dueDates = open.map((cuota) => cuota.dueDate).sort();
    if (!matchesFilter(query.filter, dueDates, today)) continue;

    const search = query.search.trim();
    if (search) {
      const byNumber = searchDigits !== '' && String(negocio.numero).includes(searchDigits);
      const byText = matchesNormalized(search, customer.name, negocio.direccion, customer.idNumber);
      if (!byNumber && !byText) continue;
    }

    const municipioId = negocio.municipioId || customer.municipioId || null;
    const veredaId = negocioVeredaLocal({
      negocioMunicipioId: negocio.municipioId,
      negocioVeredaId: negocio.veredaId ?? null,
      customerMunicipioId: customer.municipioId,
      customerVeredaId: customer.veredaId,
    });
    const municipio = municipioId ? municipios.get(municipioId) : undefined;
    const departamentoId = municipio?.departamento_id || null;
    const { location } = query;
    if (location.municipioId && municipioId !== location.municipioId) continue;
    if (location.departamentoId && departamentoId !== location.departamentoId) continue;
    if (location.veredaId && veredaId !== location.veredaId) continue;

    const overdue = open
      .filter((cuota) => cuota.dueDate < today)
      .reduce((sum, cuota) => sum + pending(cuota), 0);
    matches.push({
      negocio_id: negocio.id,
      negocio_numero: negocio.numero,
      customer_name: customer.name,
      customer_id_number: customer.idNumber,
      customer_phone: customer.phone,
      customer_address: negocio.direccion?.trim() || 'Dirección no registrada',
      municipality_id: municipioId,
      municipality_name: municipio?.nombre || null,
      expected_balance: expected,
      overdue_balance: overdue,
      next_due_date: dueDates[0],
      open_installments: open.length,
      total_count: 0,
      vereda_id: veredaId,
      vereda_name: veredaId ? veredas.get(veredaId)?.nombre || null : null,
      departamento_id: departamentoId,
      departamento_name: departamentoId ? departamentos.get(departamentoId)?.nombre || null : null,
    });
  }

  matches.sort((a, b) =>
    a.next_due_date === b.next_due_date
      ? a.negocio_numero - b.negocio_numero
      : a.next_due_date < b.next_due_date ? -1 : 1
  );
  const totalCount = matches.length;
  const start = (Math.max(input.page, 1) - 1) * input.pageSize;
  const rows = matches
    .slice(start, start + input.pageSize)
    .map((row) => ({ ...row, total_count: totalCount }));
  return { rows, totalCount };
}

/** «Vereda, Municipio» para mostrar debajo de la dirección. */
export function formatCandidatePlace(row: {
  vereda_name?: string | null;
  municipality_name?: string | null;
}) {
  return [row.vereda_name, row.municipality_name].filter(Boolean).join(', ');
}
