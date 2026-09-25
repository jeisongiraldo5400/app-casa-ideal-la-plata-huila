import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { loadNegocioSyncOverlay } from '@/lib/offline/repositories/offlineRepository';
import type { LocalNegocioListItem } from '@/lib/offline/domain/negociosLocal';
import type { NegocioSyncState } from '@/lib/negocios/negocioSyncBadge';

type Overlay = { states: Record<string, NegocioSyncState>; items: LocalNegocioListItem[] };

const EMPTY: Overlay = { states: {}, items: [] };

/**
 * Estado de envío de los negocios creados en el teléfono (pendiente o
 * rechazado), para el distintivo de la lista. Se recalcula al volver a la
 * pantalla y cada vez que la cola cambia (contadores, fin de una
 * sincronización), así el distintivo desaparece solo cuando el servidor
 * confirma el negocio.
 */
export function useNegocioSyncOverlay(): Overlay {
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const failedCount = useSyncStore((state) => state.failedCount);
  const status = useSyncStore((state) => state.status);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const request = useRef(0);

  const reload = useCallback(() => {
    const current = ++request.current;
    loadNegocioSyncOverlay()
      .then((next) => {
        // Una lectura más nueva ya está en camino: no pisarla con una vieja.
        if (current !== request.current) return;
        setOverlay((prev) =>
          next.items.length === 0 && Object.keys(next.states).length === 0 && prev === EMPTY ? prev : next
        );
      })
      .catch(() => {
        if (current === request.current) setOverlay(EMPTY);
      });
  }, []);

  useEffect(() => {
    // `syncing` es transitorio: se espera a que termine para leer el resultado.
    if (status === 'syncing') return;
    reload();
  }, [reload, pendingCount, failedCount, status, lastSyncedAt]);

  useFocusEffect(reload);

  return overlay;
}
