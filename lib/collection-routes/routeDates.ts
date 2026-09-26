/**
 * Fecha de la ruta al armarla: hoy, mañana u otra fecha futura. El servidor
 * (create_collection_route) acepta cualquier fecha desde hoy (hora de
 * Bogotá) y admite UNA ruta no cancelada por gestor y día
 * (uq_collection_routes_manager_day). Módulo puro.
 */
type DatedRoute = { route_date: string; status: string };

/** aaaa-mm-dd + n días (calendario, sin husos: se opera a mediodía UTC). */
export function addDaysToDateValue(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Días que ya tienen una ruta viva (no cancelada): no admiten otra. */
export function takenRouteDates(routes: DatedRoute[]): Set<string> {
  return new Set(routes.filter((route) => route.status !== 'cancelada').map((route) => route.route_date));
}

/**
 * Fecha con la que abre el armado: la pedida (si es válida y libre), si no
 * hoy, y si hoy ya tiene ruta, el primer día libre desde mañana.
 */
export function defaultRouteDate(today: string, taken: Set<string>, requested?: string | null): string {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested >= today && !taken.has(requested)) {
    return requested;
  }
  let candidate = today;
  for (let i = 0; i < 60 && taken.has(candidate); i += 1) candidate = addDaysToDateValue(candidate, 1);
  return candidate;
}

/** «hoy», «mañana» o «el 28 sep.». */
export function routeDateLabel(value: string, today: string): string {
  if (value === today) return 'hoy';
  if (value === addDaysToDateValue(today, 1)) return 'mañana';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `el ${date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
}

/** Por qué no se puede crear la ruta en esa fecha (null = se puede). */
export function routeDateError(value: string, today: string, taken: Set<string>): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Elige la fecha de la ruta.';
  if (value < today) return 'La fecha de la ruta no puede estar en el pasado.';
  if (taken.has(value)) return `Ya tienes una ruta para ${routeDateLabel(value, today)}. Ábrela desde Rutas o cancélala primero.`;
  return null;
}
