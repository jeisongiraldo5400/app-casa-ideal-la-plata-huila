export type RouteStatus = 'borrador' | 'activa' | 'completada' | 'cancelada';
export type StopStatus = 'pendiente' | 'actual' | 'cobrado' | 'sin_pago' | 'reprogramado' | 'omitido';
/**
 * Estado de cobro para filtrar al armar la ruta. 'vencidas' = en mora;
 * 'pronto' = al día con una cuota que vence en los próximos 7 días. 'hoy'
 * solo lo usa la app anterior (el servidor lo sigue aceptando).
 */
export type CandidateFilter = 'todas' | 'hoy' | 'vencidas' | 'al_dia' | 'pronto';

/** Filtro de ubicación al armar la ruta. '' en cualquier nivel = sin filtrar. */
export type RouteLocationFilter = {
  departamentoId: string;
  municipioId: string;
  veredaId: string;
};

export const EMPTY_ROUTE_LOCATION_FILTER: RouteLocationFilter = {
  departamentoId: '',
  municipioId: '',
  veredaId: '',
};

export type CandidateQuery = {
  search: string;
  filter: CandidateFilter;
  location: RouteLocationFilter;
};

export type CollectionRouteCandidate = {
  negocio_id: string;
  negocio_numero: number;
  customer_name: string;
  customer_id_number: string | null;
  customer_phone: string | null;
  customer_address: string;
  municipality_id: string | null;
  municipality_name: string | null;
  expected_balance: number;
  overdue_balance: number;
  next_due_date: string;
  open_installments: number;
  total_count: number;
  /** Desde 20261211120000 (null con el servidor anterior o sin vereda). */
  vereda_id?: string | null;
  vereda_name?: string | null;
  departamento_id?: string | null;
  departamento_name?: string | null;
};

export type CollectionRouteStop = {
  id: string;
  negocio_id: string;
  negocio_numero: number;
  position: number;
  status: StopStatus;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string;
  municipality_name: string | null;
  expected_balance: number;
  payment_id: string | null;
  payment_amount: number | null;
  outcome_reason: string | null;
  notes: string | null;
  arrived_at: string | null;
  completed_at: string | null;
};

export type CollectionRoute = {
  id: string;
  gestor_id: string;
  route_date: string;
  status: RouteStatus;
  started_at: string | null;
  completed_at: string | null;
  total_expected: number;
  total_collected: number;
  stops: CollectionRouteStop[];
};

export type CollectionRouteSummary = {
  id: string;
  route_date: string;
  status: RouteStatus;
  stop_count: number;
  completed_count: number;
  expected_total: number;
  collected_total: number;
};

