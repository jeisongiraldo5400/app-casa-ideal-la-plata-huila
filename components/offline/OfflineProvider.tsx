import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { openDatabaseForUser } from '@/lib/offline/database';
import { startSyncListeners, stopSyncListeners, runSync } from '@/lib/offline/sync/syncEngine';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { shouldLockApp } from '@/lib/offline/security/sessionPolicy';
import { getSecureJson, SECURE_KEYS } from '@/lib/offline/security/secureKeys';
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
        setLocked(false);
        stopSyncListeners();
        return;
      }
      try {
        const lockEnabled = await getSecureJson<boolean>(SECURE_KEYS.appLockEnabled);
        if (cancelled) return;
        setLocked(lockEnabled !== false);
        await openDatabaseForUser(user.id);
        if (cancelled) return;
        setUserId(user.id);
        startSyncListeners();
        void runSync('foreground');
      } catch (error) {
        if (!cancelled) setLocked(true);
        console.error('No se pudo inicializar el modo sin conexión', error);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, setLocked, setUserId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        lastBackgroundAt = Date.now();
      }
      if (state === 'active') {
        if (shouldLockApp(lastBackgroundAt)) setLocked(true);
        lastBackgroundAt = null;
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
