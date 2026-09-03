import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { isNetInfoOnline } from '@/lib/offline/network';

/** Mismo criterio que lib/offline/sync: desconectado solo cuando NetInfo lo afirma. */
export const isOnline = isNetInfoOnline;

/** true mientras hay red utilizable; se actualiza con los eventos de NetInfo. */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch()
      .then((state) => {
        if (mounted) setOnline(isNetInfoOnline(state));
      })
      .catch(() => undefined);
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (mounted) setOnline(isNetInfoOnline(state));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return online;
}
