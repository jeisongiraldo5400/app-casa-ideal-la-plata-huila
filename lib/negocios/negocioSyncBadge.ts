import type { StatusTone } from '@/components/ui/StatusChip';
import type { NegocioSyncState } from '@/lib/offline/sync/negocioPendingSync';

export type { NegocioSyncState };

/** Distintivo de la tarjeta de un negocio creado en el teléfono y aún sin confirmar. */
export const NEGOCIO_SYNC_BADGE: Record<
  NegocioSyncState,
  { label: string; tone: StatusTone; icon: 'cloud-upload' | 'error-outline'; hint: string }
> = {
  pending: {
    label: 'Pendiente de enviar',
    tone: 'warning',
    icon: 'cloud-upload',
    hint: 'Guardado en el teléfono; se enviará solo cuando haya señal.',
  },
  rejected: {
    label: 'No se pudo enviar',
    tone: 'error',
    icon: 'error-outline',
    hint: 'Abre «Cambios sin sincronizar» para ver el motivo, reintentar o descartar.',
  },
};

/**
 * Pone arriba los negocios creados en el teléfono que aún no confirma el
 * servidor, para que el vendedor los vea sin buscar.
 *
 * Con señal la lista viene del servidor y no los trae (no existen allí): se
 * añaden desde `unsynced`, las filas locales. Sin señal la lista ya es local
 * y los trae al final (número 0): solo se reordenan. Nunca se duplica un id.
 */
export function withUnsyncedNegociosFirst<T extends { id: string }>(
  list: T[],
  unsynced: T[],
  states: Record<string, NegocioSyncState>
): T[] {
  if (!unsynced.length && !list.some((item) => states[item.id])) return list;
  const listed = new Map(list.map((item) => [item.id, item]));
  const first: T[] = [];
  const seen = new Set<string>();
  for (const item of unsynced) {
    if (!states[item.id] || seen.has(item.id)) continue;
    seen.add(item.id);
    first.push(listed.get(item.id) ?? item);
  }
  for (const item of list) {
    if (states[item.id] && !seen.has(item.id)) {
      seen.add(item.id);
      first.push(item);
    }
  }
  return [...first, ...list.filter((item) => !seen.has(item.id))];
}

/**
 * ¿La tarjeta debe abrir «Cambios sin sincronizar» en vez de la ficha?
 * Solo si está rechazado (allí se reintenta o descarta). Pendiente abre la
 * ficha, con o sin señal: la ficha cae a la base del teléfono cuando el
 * servidor aún no lo conoce y muestra «Pendiente de enviar · sin número aún».
 * `listFromServer` se conserva por compatibilidad con quien lo llama.
 */
export function negocioCardOpensSyncQueue(state: NegocioSyncState | undefined, _listFromServer?: boolean) {
  return state === 'rejected';
}
