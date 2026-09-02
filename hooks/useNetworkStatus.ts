import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** Mismo criterio que lib/offline/sync: desconectado solo cuando NetInfo lo afirma. */
export function isOnline(state: NetInfoState | null | undefined): boolean {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/** true mientras hay red utilizable; se actualiza con los eventos de NetInfo. */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch()
      .then((state) => {
        if (mounted) setOnline(isOnline(state));
      })
      .catch(() => undefined);
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (mounted) setOnline(isOnline(state));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return online;
}
