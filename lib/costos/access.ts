/**
 * Perfil «costos» en el teléfono (20261231600000 / 20261231650000).
 *
 * Quien tiene SOLO ese perfil entra a la app como cualquier usuario (el
 * inicio de sesión no pide un rol operativo), pero no tiene nada de almacén
 * ni de ventas: ve Inicio, Inventario (consulta, igual que cualquier usuario)
 * con el botón «Últimas compras», Escanear y Perfil. No se le muestran el
 * resumen de órdenes ni la pestaña Salidas, que no son suyos.
 */
const norm = (name: string) => name.trim().toLowerCase();

export const COSTOS_ROLE = 'costos';

export function hasCostosRole(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => norm(name) === COSTOS_ROLE);
}

/** true si el único perfil del usuario es «costos». */
export function isCostosOnlyUser(roleNames: readonly string[]): boolean {
  const names = roleNames.map(norm).filter(Boolean);
  return names.length > 0 && names.every((name) => name === COSTOS_ROLE);
}

export type NegocioDetailView = 'costos' | 'completo';

/**
 * Qué muestra `/negocio/[id]`. El detalle del negocio NUNCA muestra costos ni
 * margen, aunque el usuario tenga el perfil «costos»: eso vive en la pantalla
 * del aviso (`/costos/aviso/[negocioId]`).
 *
 * Solo dos casos caen a la vista de costos:
 * - quien tiene SOLO el perfil «costos» (no puede leer el negocio);
 * - un enlace viejo `/negocio/[id]?view=costos` de quien tiene el perfil.
 */
export function negocioDetailViewFor(
  roleNames: readonly string[],
  { requestedView }: { requestedView?: unknown } = {}
): NegocioDetailView {
  if (isCostosOnlyUser(roleNames)) return 'costos';
  if (requestedView === 'costos' && hasCostosRole(roleNames)) return 'costos';
  return 'completo';
}

/** Ruta de la pantalla del aviso de venta bajo costo o bajo margen. */
export function costAlertRoute(negocioId: string): string {
  return `/costos/aviso/${encodeURIComponent(negocioId)}`;
}

export type CostAlertAccess = 'cargando' | 'sin_acceso' | 'permitido';

/**
 * Quién abre la pantalla del aviso: solo el perfil «costos» (el servidor
 * tampoco le respondería a otro). Mientras los perfiles cargan no se decide.
 */
export function costAlertAccessFor(
  roleNames: readonly string[],
  { rolesLoading }: { rolesLoading: boolean }
): CostAlertAccess {
  if (hasCostosRole(roleNames)) return 'permitido';
  return rolesLoading ? 'cargando' : 'sin_acceso';
}
