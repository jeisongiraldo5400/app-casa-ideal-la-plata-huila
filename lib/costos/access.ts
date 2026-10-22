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
 * Qué detalle de negocio se muestra. El aviso de venta bajo costo llega a todo
 * el que tenga el perfil «costos», aunque tenga otro rol: si ese otro rol no
 * deja leer el negocio (vendedor de otro negocio, bodeguero), se muestra solo
 * el costo y el margen en vez de «No se encontró el negocio».
 */
export function negocioDetailViewFor(
  roleNames: readonly string[],
  { negocioNotReadable }: { negocioNotReadable: boolean }
): NegocioDetailView {
  if (isCostosOnlyUser(roleNames)) return 'costos';
  if (negocioNotReadable && hasCostosRole(roleNames)) return 'costos';
  return 'completo';
}
