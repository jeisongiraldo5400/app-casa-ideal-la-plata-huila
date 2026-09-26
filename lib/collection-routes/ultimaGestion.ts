/**
 * «Última gestión»: la última novedad de ruta de un negocio («Sin pago» o
 * «Reprogramado») con su motivo y fecha, para que quien cobra sepa qué pasó
 * en la última visita. Con señal la da `get_negocios_ultima_gestion`
 * (20261220120000); sin señal, las paradas guardadas en el teléfono.
 */
export type UltimaGestionStatus = 'sin_pago' | 'reprogramado';

export type UltimaGestion = {
  negocio_id: string;
  stop_status: UltimaGestionStatus;
  outcome_reason: string | null;
  notes: string | null;
  /** Cuándo se registró la novedad (ISO); si falta, la fecha de la ruta. */
  occurred_at: string | null;
  route_date: string | null;
  gestor_name: string | null;
};

const LABEL: Record<UltimaGestionStatus, string> = {
  sin_pago: 'Sin pago',
  reprogramado: 'Reprogramado',
};

export function isUltimaGestionStatus(value: unknown): value is UltimaGestionStatus {
  return value === 'sin_pago' || value === 'reprogramado';
}

function when(gestion: UltimaGestion): number {
  const at = gestion.occurred_at ? Date.parse(gestion.occurred_at) : NaN;
  if (Number.isFinite(at)) return at;
  const day = gestion.route_date ? Date.parse(`${gestion.route_date}T12:00:00-05:00`) : NaN;
  return Number.isFinite(day) ? day : 0;
}

/** La más reciente por negocio; en un empate gana la que llegó primero (la del servidor). */
export function latestGestionByNegocio(rows: UltimaGestion[]): Map<string, UltimaGestion> {
  const result = new Map<string, UltimaGestion>();
  for (const row of rows) {
    const current = result.get(row.negocio_id);
    if (!current || when(row) > when(current)) result.set(row.negocio_id, row);
  }
  return result;
}

/** «12 sep.» en hora de Bogotá. */
export function formatGestionDate(gestion: UltimaGestion): string {
  const value = gestion.occurred_at || (gestion.route_date ? `${gestion.route_date}T12:00:00-05:00` : null);
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
}

/** «Sin pago · No estaba · 12 sep.» */
export function labelUltimaGestion(gestion: UltimaGestion): string {
  return [LABEL[gestion.stop_status], gestion.outcome_reason?.trim() || null, formatGestionDate(gestion) || null]
    .filter(Boolean)
    .join(' · ');
}

export function ultimaGestionStatusLabel(status: UltimaGestionStatus): string {
  return LABEL[status];
}
