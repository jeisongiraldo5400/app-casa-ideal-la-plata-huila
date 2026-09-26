import { create } from 'zustand';
import { PULL_CURSOR_OVERLAP_MS } from '../sync/types';

/**
 * Hora aproximada de la última descarga a partir del cursor guardado en
 * `sync_meta.last_pulled_at`. El cursor se escribe con un solape hacia atrás
 * (`PULL_CURSOR_OVERLAP_MS`) para no perder filas, así que se le devuelve ese
 * margen. `null` si nunca se descargó o si el valor no es una fecha.
 */
export function lastSyncedAtFromCursor(
  cursor: string | null | undefined,
  overlapMs = PULL_CURSOR_OVERLAP_MS
): number | null {
  if (!cursor) return null;
  const parsed = Date.parse(cursor);
  return Number.isNaN(parsed) ? null : parsed + overlapMs;
}

export type SyncEngineStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  userId: string | null;
  online: boolean;
  status: SyncEngineStatus;
  /** Comandos que se enviarán solos (pendientes o en espera de reintento). */
  pendingCount: number;
  /** Comandos rechazados que requieren decisión del usuario. */
  failedCount: number;
  /** Enviados con un aviso que la persona aún no ha visto (p. ej. otro dueño). */
  noticeCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  locked: boolean;
  queueVisible: boolean;
  setUserId: (userId: string | null) => void;
  setOnline: (online: boolean) => void;
  setStatus: (status: SyncEngineStatus) => void;
  setPendingCount: (pendingCount: number) => void;
  setFailedCount: (failedCount: number) => void;
  setNoticeCount: (noticeCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: number | null) => void;
  setLastError: (lastError: string | null) => void;
  setLocked: (locked: boolean) => void;
  setQueueVisible: (queueVisible: boolean) => void;
  /**
   * Siembra la hora de la última descarga al arrancar. `lastSyncedAt` solo
   * vivía en memoria: al reiniciar la app sin señal, todos los «última
   * descarga HH:MM» desaparecían aunque los datos locales siguieran ahí.
   * No pisa un valor ya presente (una sincronización de esta sesión es más
   * reciente que el cursor guardado).
   */
  hydrateLastSyncedAt: (cursor: string | null | undefined) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  userId: null,
  online: true,
  status: 'idle',
  pendingCount: 0,
  failedCount: 0,
  noticeCount: 0,
  lastSyncedAt: null,
  lastError: null,
  locked: false,
  queueVisible: false,
  setUserId: (userId) => set({ userId }),
  setOnline: (online) => set({ online }),
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setFailedCount: (failedCount) => set({ failedCount }),
  setNoticeCount: (noticeCount) => set({ noticeCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastError: (lastError) => set({ lastError }),
  setLocked: (locked) => set({ locked }),
  setQueueVisible: (queueVisible) => set({ queueVisible }),
  hydrateLastSyncedAt: (cursor) =>
    set((state) =>
      state.lastSyncedAt ? state : { lastSyncedAt: lastSyncedAtFromCursor(cursor) }
    ),
}));
