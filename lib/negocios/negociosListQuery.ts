/**
 * Lista unificada de Negocios (pestañas Todos, Míos y Por cobrar): filtros,
 * orden y resumen.
 *
 * Con señal todo lo resuelve el RPC `list_negocios_movil` (20261209120000);
 * este módulo traduce su respuesta y es el ESPEJO del RPC para el modo sin
 * conexión, con las mismas reglas:
 *
 * - Ubicación: la del negocio; si no tiene municipio, la del cliente. La
 *   vereda sale del cliente cuando ambos están en el mismo municipio (el
 *   teléfono no guarda la vereda del negocio).
 * - En mora: alguna cuota abierta con saldo ya vencida (o marcada 'mora').
 * - Saldo: Σ max(cuota + mora − pagado, 0) de las cuotas no anuladas.
 * - Búsqueda sin tildes por cliente y cédula; los dígitos cuentan como
 *   número/cédula sólo si el término no trae letras.
 */
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { normalizeDigits, normalizeText } from '@/lib/search/normalizeText';

export type NegociosScope = 'todos' | 'mios' | 'por_cobrar';

export type NegocioStatusFilter =
  | 'todos'
  | 'activos'
  | 'activo'
  | 'entregado'
  | 'borradores'
  | 'cerrado'
  | 'anulado';

export type NegocioCobroFilter = 'todos' | 'en_mora' | 'al_dia' | 'por_vencer';

export type NegociosOrder = 'recientes' | 'saldo' | 'atraso' | 'municipio';

export type NegociosListFilters = {
  departamentoId: string;
  municipioId: string;
  veredaId: string;
  status: NegocioStatusFilter;
  cobro: NegocioCobroFilter;
  /** Días de «vence en N días»; sólo cuenta con `cobro = 'por_vencer'`. */
  days: number;
  order: NegociosOrder;
};

export const DEFAULT_NEGOCIOS_LIST_FILTERS: NegociosListFilters = {
  departamentoId: '',
  municipioId: '',
  veredaId: '',
  status: 'todos',
  cobro: 'todos',
  days: 7,
  order: 'recientes',
};

export const NEGOCIOS_SCOPE_LABEL: Record<NegociosScope, string> = {
  todos: 'Todos',
  mios: 'Míos',
  por_cobrar: 'Por cobrar',
};

export const NEGOCIO_STATUS_FILTER_OPTIONS: { value: NegocioStatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'activo', label: 'Activo' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'borradores', label: 'Borradores' },
  { value: 'cerrado', label: 'Cerrados' },
  { value: 'anulado', label: 'Anulados' },
];

/** Por cobrar nunca trae cerrados ni anulados: no se ofrecen. */
export function statusOptionsForScope(scope: NegociosScope) {
  return scope === 'por_cobrar'
    ? NEGOCIO_STATUS_FILTER_OPTIONS.filter((option) => option.value !== 'cerrado' && option.value !== 'anulado')
    : NEGOCIO_STATUS_FILTER_OPTIONS;
}

export const NEGOCIO_COBRO_FILTER_OPTIONS: { value: NegocioCobroFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'en_mora', label: 'En mora' },
  { value: 'al_dia', label: 'Al día' },
  { value: 'por_vencer', label: 'Cuota por vencer' },
];

export const NEGOCIO_DUE_DAYS_OPTIONS = [3, 7, 15, 30];

export const NEGOCIOS_ORDER_OPTIONS: { value: NegociosOrder; label: string }[] = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'saldo', label: 'Mayor saldo' },
  { value: 'atraso', label: 'Más atrasados' },
  { value: 'municipio', label: 'Por municipio' },
];

/**
 * Cuántos filtros están puestos (el orden no cuenta: no quita filas). Alimenta
 * el contador del botón «Filtros».
 */
export function countActiveNegociosFilters(filters: NegociosListFilters): number {
  return [
    filters.departamentoId,
    filters.municipioId,
    filters.veredaId,
    filters.status !== 'todos',
    filters.cobro !== 'todos',
  ].filter(Boolean).length;
}

/** Fila de la lista: lo que pinta `NegocioListCard`, con o sin señal. */
export type NegocioListRow = {
  id: string;
  numero: number;
  status: string;
  deal_date: string | null;
  created_at: string | null;
  installments_count: number | null;
  total_credit: number;
  remaining_balance: number;
  has_mora: boolean;
  customer_id: string | null;
  customer: { name: string; id_number: string | null };
  seller_id: string | null;
  created_by: string | null;
  gestor_cobro_id: string | null;
  delivery_order_id: string | null;
  remission_id: string | null;
  source_delivery_order_id: string | null;
  delivery_order: { order_number: string | null } | null;
  remission: { order_number: string | null } | null;
  source_delivery_order: { order_number: string | null } | null;
  dias_atraso: number | null;
  overdue_amount: number;
  next_due_date: string | null;
  next_due_amount: number | null;
  departamento_id: string | null;
  departamento_name: string | null;
  municipio_id: string | null;
  municipio_name: string | null;
  vereda_id: string | null;
  vereda_name: string | null;
  address: string | null;
};

export type NegociosListSummary = {
  totalCount: number;
  totalSaldo: number;
  moraCount: number;
};

export const EMPTY_NEGOCIOS_SUMMARY: NegociosListSummary = { totalCount: 0, totalSaldo: 0, moraCount: 0 };

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : num(value);
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const order = (value: unknown) => (str(value) ? { order_number: str(value) } : null);

/** Fila del RPC → fila de la lista. */
export function mapServerNegocioRow(raw: Record<string, unknown>): NegocioListRow {
  return {
    id: String(raw.id),
    numero: num(raw.numero),
    status: String(raw.status ?? ''),
    deal_date: str(raw.deal_date),
    created_at: str(raw.created_at),
    installments_count: numOrNull(raw.installments_count),
    total_credit: num(raw.total_credit),
    remaining_balance: num(raw.remaining_balance),
    has_mora: Boolean(raw.has_mora),
    customer_id: str(raw.customer_id),
    customer: { name: str(raw.customer_name) ?? 'Cliente', id_number: str(raw.customer_id_number) },
    seller_id: str(raw.seller_id),
    created_by: str(raw.created_by),
    gestor_cobro_id: str(raw.gestor_cobro_id),
    delivery_order_id: str(raw.delivery_order_id),
    remission_id: str(raw.remission_id),
    source_delivery_order_id: str(raw.source_delivery_order_id),
    delivery_order: order(raw.delivery_order_number),
    remission: order(raw.remission_number),
    source_delivery_order: order(raw.source_order_number),
    dias_atraso: numOrNull(raw.dias_atraso),
    overdue_amount: num(raw.overdue_amount),
    next_due_date: str(raw.next_due_date),
    next_due_amount: numOrNull(raw.next_due_amount),
    departamento_id: str(raw.departamento_id),
    departamento_name: str(raw.departamento_name),
    municipio_id: str(raw.municipio_id),
    municipio_name: str(raw.municipio_name),
    vereda_id: str(raw.vereda_id),
    vereda_name: str(raw.vereda_name),
    address: str(raw.address),
  };
}

export function mapServerSummary(raw: unknown): NegociosListSummary {
  const summary = (raw ?? {}) as Record<string, unknown>;
  return {
    totalCount: num(summary.total_count),
    totalSaldo: num(summary.total_saldo),
    moraCount: num(summary.mora_count),
  };
}

// ---------------------------------------------------------------------------
// Modo sin conexión
// ---------------------------------------------------------------------------

export type LocalCuotaInput = {
  dueDate: string;
  installmentNumber: number;
  amount: number;
  paidAmount: number;
  lateFeeAmount: number;
  status: string;
};

/** Negocio local con lo que hace falta para filtrarlo como el servidor. */
export type LocalNegocioInput = {
  id: string;
  numero: number;
  status: string;
  dealDate: string | null;
  installmentsCount: number | null;
  totalCredit: number;
  customerId: string | null;
  customerName: string | null;
  customerIdNumber: string | null;
  sellerId: string | null;
  createdBy: string | null;
  gestorCobroId: string | null;
  deliveryOrderId: string | null;
  negocioMunicipioId: string | null;
  negocioAddress: string | null;
  customerMunicipioId: string | null;
  customerVeredaId: string | null;
  customerAddress: string | null;
  cuotas: LocalCuotaInput[];
  /** Saldo guardado en el negocio: sólo se usa si no bajó ninguna cuota. */
  storedBalance?: number | null;
};

export type LocalLocationNames = {
  municipios: Map<string, { nombre: string; departamentoId: string | null }>;
  veredas: Map<string, string>;
  departamentos: Map<string, string>;
};

const OPEN_CUOTA = new Set(['pendiente', 'parcial', 'mora']);

const cuotaSaldo = (cuota: LocalCuotaInput) =>
  Math.max(num(cuota.amount) + num(cuota.lateFeeAmount) - num(cuota.paidAmount), 0);

/** Días entre dos fechas 'YYYY-MM-DD' (b − a). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = b.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

const blank = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

/** Entrada de la lista local: la fila y las cuotas abiertas, para «por vencer». */
export type LocalNegocioEntry = {
  row: NegocioListRow;
  openDueDates: string[];
};

export function buildLocalNegocioEntry(
  input: LocalNegocioInput,
  today: string,
  names: LocalLocationNames
): LocalNegocioEntry {
  const live = input.cuotas.filter((cuota) => cuota.status !== 'anulada');
  const open = live
    .filter((cuota) => OPEN_CUOTA.has(cuota.status) && cuotaSaldo(cuota) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber);
  const overdue = open.filter((cuota) => cuota.status === 'mora' || cuota.dueDate.slice(0, 10) < today);
  const oldest = overdue.length ? overdue[0].dueDate.slice(0, 10) : null;

  const fromNegocio = Boolean(input.negocioMunicipioId);
  const municipioId = fromNegocio ? input.negocioMunicipioId : input.customerMunicipioId;
  const veredaId = fromNegocio
    ? input.customerMunicipioId === input.negocioMunicipioId
      ? input.customerVeredaId
      : null
    : input.customerVeredaId;
  const municipio = municipioId ? names.municipios.get(municipioId) : undefined;
  const departamentoId = municipio?.departamentoId ?? null;

  return {
    row: {
      id: input.id,
      numero: num(input.numero),
      status: input.status,
      deal_date: input.dealDate,
      created_at: null,
      installments_count: input.installmentsCount,
      total_credit: num(input.totalCredit),
      remaining_balance: input.cuotas.length
        ? live.reduce((total, cuota) => total + cuotaSaldo(cuota), 0)
        : num(input.storedBalance),
      has_mora: oldest !== null,
      customer_id: input.customerId,
      customer: { name: input.customerName || 'Cliente', id_number: input.customerIdNumber },
      seller_id: input.sellerId,
      created_by: input.createdBy,
      gestor_cobro_id: input.gestorCobroId,
      delivery_order_id: input.deliveryOrderId,
      remission_id: null,
      source_delivery_order_id: null,
      delivery_order: null,
      remission: null,
      source_delivery_order: null,
      dias_atraso: oldest ? Math.max(daysBetween(oldest, today), 0) : null,
      overdue_amount: overdue.reduce((total, cuota) => total + cuotaSaldo(cuota), 0),
      next_due_date: open[0]?.dueDate.slice(0, 10) ?? null,
      next_due_amount: open[0] ? cuotaSaldo(open[0]) : null,
      departamento_id: departamentoId,
      departamento_name: departamentoId ? names.departamentos.get(departamentoId) ?? null : null,
      municipio_id: municipioId ?? null,
      municipio_name: municipio?.nombre ?? null,
      vereda_id: veredaId ?? null,
      vereda_name: veredaId ? names.veredas.get(veredaId) ?? null : null,
      address: blank(input.negocioAddress) ?? blank(input.customerAddress),
    },
    openDueDates: open.map((cuota) => cuota.dueDate.slice(0, 10)),
  };
}

/** Mismo criterio de búsqueda que el RPC. */
export function matchesNegocioSearch(row: NegocioListRow, term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed) return true;
  const needle = normalizeText(trimmed);
  if (normalizeText(row.customer.name).includes(needle)) return true;
  if (normalizeText(row.customer.id_number).includes(needle)) return true;
  if (/\p{L}/u.test(trimmed)) return false;
  const digits = normalizeDigits(trimmed);
  if (!digits) return false;
  return (
    normalizeDigits(row.customer.id_number).includes(digits) ||
    normalizeDigits(formatNegocioCodigo(row.numero)).includes(digits) ||
    String(row.numero).includes(digits)
  );
}

function matchesStatus(status: string, filter: NegocioStatusFilter): boolean {
  switch (filter) {
    case 'todos':
      return true;
    case 'activos':
      return status === 'activo' || status === 'entregado';
    case 'borradores':
      return status === 'borrador' || status === 'por_firmar';
    default:
      return status === filter;
  }
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type LocalListQuery = {
  scope: NegociosScope;
  userId: string;
  /** Por cobrar: gestor consultado (null = uno mismo). */
  gestorId: string | null;
  search: string;
  filters: NegociosListFilters;
  today: string;
  /** Recaudador «puro»: sin término no ve lista. */
  searchOnly?: boolean;
};

const compareNullableText = (a: string | null, b: string | null) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return normalizeText(a).localeCompare(normalizeText(b));
};

/** Espejo local de `list_negocios_movil` (sin paginar: el teléfono tiene todo). */
export function queryLocalNegocios(
  entries: LocalNegocioEntry[],
  query: LocalListQuery
): { rows: NegocioListRow[]; summary: NegociosListSummary } {
  const { scope, userId, filters, today } = query;
  if (scope === 'todos' && query.searchOnly && !query.search.trim()) {
    return { rows: [], summary: EMPTY_NEGOCIOS_SUMMARY };
  }
  const gestor = query.gestorId || userId;
  const soonLimit = addDays(today, Math.max(0, filters.days));

  const matched = entries.filter(({ row, openDueDates }) => {
    if (scope === 'mios' && row.seller_id !== userId && row.created_by !== userId) return false;
    if (
      scope === 'por_cobrar' &&
      (row.gestor_cobro_id !== gestor || row.status === 'cerrado' || row.status === 'anulado')
    ) {
      return false;
    }
    if (!matchesStatus(row.status, filters.status)) return false;
    if (filters.departamentoId && row.departamento_id !== filters.departamentoId) return false;
    if (filters.municipioId && row.municipio_id !== filters.municipioId) return false;
    if (filters.veredaId && row.vereda_id !== filters.veredaId) return false;
    if (filters.cobro === 'en_mora' && !row.has_mora) return false;
    if (filters.cobro === 'al_dia' && row.has_mora) return false;
    if (
      filters.cobro === 'por_vencer' &&
      !openDueDates.some((due) => due >= today && due <= soonLimit)
    ) {
      return false;
    }
    return matchesNegocioSearch(row, query.search);
  });

  const rows = matched.map((entry) => entry.row);
  const byRecent = (a: NegocioListRow, b: NegocioListRow) =>
    // Sin señal no hay created_at: la fecha del negocio y el número hacen de
    // «más reciente». Los creados sin señal (número 0) van arriba.
    (a.numero === 0 ? -1 : 0) - (b.numero === 0 ? -1 : 0) ||
    (b.deal_date ?? '').localeCompare(a.deal_date ?? '') ||
    b.numero - a.numero;
  const comparators: Record<NegociosOrder, (a: NegocioListRow, b: NegocioListRow) => number> = {
    recientes: byRecent,
    saldo: (a, b) => b.remaining_balance - a.remaining_balance || byRecent(a, b),
    atraso: (a, b) =>
      (b.dias_atraso ?? -1) - (a.dias_atraso ?? -1) ||
      b.remaining_balance - a.remaining_balance ||
      byRecent(a, b),
    municipio: (a, b) =>
      compareNullableText(a.municipio_name, b.municipio_name) ||
      compareNullableText(a.vereda_name, b.vereda_name) ||
      compareNullableText(a.customer.name, b.customer.name) ||
      byRecent(a, b),
  };
  rows.sort(comparators[filters.order]);

  return {
    rows,
    summary: {
      totalCount: rows.length,
      totalSaldo: rows.reduce((total, row) => total + row.remaining_balance, 0),
      moraCount: rows.filter((row) => row.has_mora).length,
    },
  };
}

/** «Vereda, Municipio» y la dirección, para la tarjeta. */
export function formatNegocioLocationLine(row: Pick<NegocioListRow, 'address' | 'vereda_name' | 'municipio_name'>) {
  return [row.address, row.vereda_name, row.municipio_name]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Pestañas por rol
// ---------------------------------------------------------------------------

export type NegociosRoleFlags = {
  isAdmin: boolean;
  isVendedor: boolean;
  isGestorCobro: boolean;
  isRecaudador?: boolean;
};

/**
 * Pestañas que ve cada rol (regla del usuario, 2026-09-25):
 * - «Todos»: SOLO admin y recaudador.
 * - «Míos»: el vendedor (los negocios que él hizo).
 * - «Por cobrar»: el gestor de cobro (los asignados a él) y el admin (elige el gestor).
 * Un rol sin ninguna de esas ve «Míos», nunca todos.
 */
export function availableNegociosScopes(roles: NegociosRoleFlags): NegociosScope[] {
  const scopes: NegociosScope[] = [];
  if (roles.isAdmin || roles.isRecaudador) scopes.push('todos');
  if (roles.isVendedor) scopes.push('mios');
  if (roles.isGestorCobro || roles.isAdmin) scopes.push('por_cobrar');
  return scopes.length ? scopes : ['mios'];
}

/** Pestaña inicial: la pedida por la ruta si el rol la tiene; el gestor abre en «Por cobrar». */
export function initialNegociosScope(
  available: NegociosScope[],
  roles: NegociosRoleFlags,
  requested?: string | null
): NegociosScope {
  if (requested && (available as string[]).includes(requested)) return requested as NegociosScope;
  if (roles.isGestorCobro && !roles.isAdmin && available.includes('por_cobrar')) return 'por_cobrar';
  return available.includes('todos') ? 'todos' : available[0];
}
