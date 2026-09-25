import { useEffect, useState } from 'react';
import { listLocalOfflineOrders } from '@/lib/offline/repositories/deliveryOrdersRepository';
import { useSyncStore } from '@/lib/offline/store/syncStore';

export interface LocalOfflineOrderStatus {
  /** Momento (ms) de la foto de la orden en el teléfono. */
  snapshotAt: number | null;
  usable: boolean;
  unusableReason: string | null;
}

type Cache = { key: number | null; promise: Promise<Map<string, LocalOfflineOrderStatus>> };
let cache: Cache | null = null;

/**
 * Una sola lectura de la base local para toda la lista: cada tarjeta de orden
 * pregunta si su orden ya está en el teléfono y, sin esto, serían cientos de
 * consultas iguales. Se vuelve a leer tras cada sincronización.
 */
function loadLocalOrders(key: number | null) {
  if (!cache || cache.key !== key) {
    cache = {
      key,
      promise: listLocalOfflineOrders()
        .then(
          (rows) =>
            new Map(
              rows.map((row) => [
                row.id,
                { snapshotAt: row.snapshotAt, usable: row.usable, unusableReason: row.unusableReason },
              ])
            )
        )
        .catch(() => new Map<string, LocalOfflineOrderStatus>()),
    };
  }
  return cache.promise;
}

/** Solo para pruebas. */
export function resetLocalOfflineOrdersCache() {
  cache = null;
}

/** Órdenes que ya bajaron al teléfono, por id. */
export function useLocalOfflineOrders() {
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const [orders, setOrders] = useState<Map<string, LocalOfflineOrderStatus>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void loadLocalOrders(lastSyncedAt).then((map) => {
      if (!cancelled) setOrders(map);
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncedAt]);

  return orders;
}
