/** Subtítulo del historial con el total real del servidor, no solo lo cargado en pantalla. */
export function exitsListSubtitle(exits: { quantity: number }[], totalCount: number): string {
  const total = Math.max(totalCount, exits.length);
  const label = `${total} ${total === 1 ? 'registro' : 'registros'}`;
  if (exits.length < total) return `${label} · mostrando ${exits.length}`;
  const units = exits.reduce((sum, item) => sum + item.quantity, 0);
  return `${label} · ${units} unidades despachadas`;
}
