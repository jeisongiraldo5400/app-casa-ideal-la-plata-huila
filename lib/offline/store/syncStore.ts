import { create } from 'zustand';

export type SyncEngineStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  userId: string | null;
  online: boolean;
  status: SyncEngineStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  locked: boolean;
  setUserId: (userId: string | null) => void;
  setOnline: (online: boolean) => void;
  setStatus: (status: SyncEngineStatus) => void;
  setPendingCount: (pendingCount: number) => void;
  setLastSyncedAt: (lastSyncedAt: number | null) => void;
  setLastError: (lastError: string | null) => void;
  setLocked: (locked: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  userId: null,
  online: true,
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  locked: false,
  setUserId: (userId) => set({ userId }),
  setOnline: (online) => set({ online }),
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastError: (lastError) => set({ lastError }),
  setLocked: (locked) => set({ locked }),
}));
