import { create } from 'zustand';

export type SyncEngineStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  userId: string | null;
  online: boolean;
  status: SyncEngineStatus;
  /** Comandos que se enviarán solos (pendientes o en espera de reintento). */
  pendingCount: number;
  /** Comandos rechazados que requieren decisión del usuario. */
  failedCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  locked: boolean;
  queueVisible: boolean;
  setUserId: (userId: string | null) => void;
  setOnline: (online: boolean) => void;
  setStatus: (status: SyncEngineStatus) => void;
  setPendingCount: (pendingCount: number) => void;
  setFailedCount: (failedCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: number | null) => void;
  setLastError: (lastError: string | null) => void;
  setLocked: (locked: boolean) => void;
  setQueueVisible: (queueVisible: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  userId: null,
  online: true,
  status: 'idle',
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  lastError: null,
  locked: false,
  queueVisible: false,
  setUserId: (userId) => set({ userId }),
  setOnline: (online) => set({ online }),
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setFailedCount: (failedCount) => set({ failedCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastError: (lastError) => set({ lastError }),
  setLocked: (locked) => set({ locked }),
  setQueueVisible: (queueVisible) => set({ queueVisible }),
}));
