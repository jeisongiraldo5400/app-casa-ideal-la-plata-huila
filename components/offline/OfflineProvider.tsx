import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { openDatabaseForUser } from '@/lib/offline/database';
import { startSyncListeners, stopSyncListeners, runSync } from '@/lib/offline/sync/syncEngine';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { shouldLockApp } from '@/lib/offline/security/sessionPolicy';
import { SyncStatusBanner } from './SyncStatusBanner';
import { AppLockGate } from './AppLockGate';

let lastBackgroundAt: number | null = null;

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const setUserId = useSyncStore((state) => state.setUserId);
  const setLocked = useSyncStore((state) => state.setLocked);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!isAuthenticated || !user?.id) {
        setUserId(null);
        stopSyncListeners();
        return;
      }
      await openDatabaseForUser(user.id);
      if (cancelled) return;
      setUserId(user.id);
      startSyncListeners();
      void runSync('foreground');
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, setUserId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        lastBackgroundAt = Date.now();
      }
      if (state === 'active' && shouldLockApp(lastBackgroundAt)) {
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, [setLocked]);

  useEffect(() => () => stopSyncListeners(), []);

  return (
    <>
      <SyncStatusBanner />
      {children}
      <AppLockGate />
    </>
  );
}
