import { useEffect, useState } from 'react';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  searchAvailableDeliveryOrders,
  type DeliveryOrderOption,
} from '../services/negociosDeliveryOrdersService';
import { searchLocalOfflineOrders } from '../services/negociosOfflineOrdersService';

/** Espera tras la última tecla antes de consultar. */
export const ORIGIN_ORDER_SEARCH_DEBOUNCE_MS = 300;

/**
 * Búsqueda de órdenes de entrega como origen de un negocio. Sólo consulta
 * mientras `enabled` (el usuario eligió «Orden de entrega existente»): antes la
 * pantalla descargaba todas las órdenes al abrirse, aunque se fuera a sacar de
 * bodega.
 *
 * Sin señal (`offline`), o si la consulta falla por red, busca en las órdenes
 * llevadas en el teléfono: las que el vendedor marcó con señal.
 */
export function useOriginOrderSearch(enabled: boolean, offline = false) {
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<DeliveryOrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La lista que se ve salió del teléfono, no del servidor. */
  const [fromLocal, setFromLocal] = useState(offline);
  /** Momento de la foto de las órdenes llevadas. */
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const loadLocal = async () => {
      const local = await searchLocalOfflineOrders(query);
      if (cancelled) return;
      setOrders(local.orders);
      setSnapshotAt(local.snapshotAt);
      setFromLocal(true);
      setError(null);
    };
    const timer = setTimeout(async () => {
      try {
        if (offline) {
          await loadLocal();
          return;
        }
        try {
          const rows = await searchAvailableDeliveryOrders(query);
          if (cancelled) return;
          setOrders(rows);
          setFromLocal(false);
          setError(null);
        } catch (err: unknown) {
          if (!isNetworkError(err)) throw err;
          await loadLocal();
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setOrders([]);
        setError(err instanceof Error && err.message ? err.message : 'No fue posible buscar órdenes de entrega');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, ORIGIN_ORDER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, offline, query]);

  return { query, setQuery, orders, loading, error, fromLocal, snapshotAt };
}
