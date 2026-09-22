import { useEffect, useState } from 'react';
import {
  searchAvailableDeliveryOrders,
  type DeliveryOrderOption,
} from '../services/negociosDeliveryOrdersService';

/** Espera tras la última tecla antes de consultar. */
export const ORIGIN_ORDER_SEARCH_DEBOUNCE_MS = 300;

/**
 * Búsqueda de órdenes de entrega como origen de un negocio. Sólo consulta
 * mientras `enabled` (el usuario eligió «Orden de entrega existente»): antes la
 * pantalla descargaba todas las órdenes al abrirse, aunque se fuera a sacar de
 * bodega.
 */
export function useOriginOrderSearch(enabled: boolean) {
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<DeliveryOrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchAvailableDeliveryOrders(query);
        if (cancelled) return;
        setOrders(rows);
        setError(null);
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
  }, [enabled, query]);

  return { query, setQuery, orders, loading, error };
}
