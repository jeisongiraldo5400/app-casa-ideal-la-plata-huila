/** Tiempo durante el que la lista y el detalle se reutilizan al volver a una pantalla. */
export const CATALOG_CACHE_TTL_MS = 30_000;

export type CacheStamp = {
  /** Epoch ms de la última carga exitosa. */
  loadedAt: number;
  /** Hubo una mutación (enlace creado, productos cambiados…) desde entonces. */
  stale: boolean;
};

/** Al volver a una pantalla: recargar solo si no hay datos, si pasaron más de 30 s o si algo cambió. */
export function needsRefresh(stamp: CacheStamp | null | undefined, now: number, ttlMs: number = CATALOG_CACHE_TTL_MS): boolean {
  if (!stamp) return true;
  if (stamp.stale) return true;
  return now - stamp.loadedAt > ttlMs;
}
