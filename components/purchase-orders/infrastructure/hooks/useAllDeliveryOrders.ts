import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeliveryLocationFilter } from '../../domain/deliveryLocation';
import { DeliveryOrder } from '../../types';
import {
  DELIVERY_ORDERS_PAGE_SIZE,
  DeliveryOrdersCursor,
  fetchDeliveryOrdersPage,
} from '../services/deliveryOrdersPageService';

const SEARCH_DEBOUNCE_MS = 400;

interface UseAllDeliveryOrdersParams {
  searchQuery: string;
  locationFilter: DeliveryLocationFilter;
  /** Cada incremento vuelve a pedir la primera página. */
  refreshTrigger?: number;
}

/**
 * Listado paginado de «Todas las órdenes».
 *
 * Trae 10 órdenes por página y pide la siguiente al llegar al final. No hay
 * TanStack Query ni AbortController en la app: las respuestas viejas se
 * descartan con un contador de petición, como en `useCustomersList`. Cambiar el
 * texto buscado o el filtro de ubicación reinicia la paginación porque `load`
 * cambia de identidad y el efecto de foco vuelve a arrancar en la página 1.
 */
export function useAllDeliveryOrders({
  searchQuery,
  locationFilter,
  refreshTrigger,
}: UseAllDeliveryOrdersParams) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery.trim());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [serverPaginated, setServerPaginated] = useState(true);

  const requestId = useRef(0);
  const cursor = useRef<DeliveryOrdersCursor | null>(null);
  const loadMoreInFlight = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const load = useCallback(
    async (options: { append: boolean; refresh: boolean }) => {
      const id = ++requestId.current;
      if (options.refresh) setRefreshing(true);
      else if (options.append) setLoadingMore(true);
      else setLoading(true);

      try {
        const page = await fetchDeliveryOrdersPage({
          search: debouncedQuery,
          location: locationFilter,
          cursor: options.append ? cursor.current : null,
          pageSize: DELIVERY_ORDERS_PAGE_SIZE,
        });
        // Una respuesta vieja no puede pisar a una nueva: ni las filas ni el
        // cursor, o la página siguiente saltaría al tramo equivocado.
        if (id !== requestId.current) return;

        setOrders((current) => {
          if (!options.append) return page.orders;
          const known = new Set(current.map((order) => order.id));
          return [...current, ...page.orders.filter((order) => !known.has(order.id))];
        });
        cursor.current = page.cursor;
        setHasMore(page.hasMore);
        setServerPaginated(page.serverPaginated);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error && err.message ? err.message : 'Error al cargar las órdenes de entrega');
        if (!options.append) {
          setOrders([]);
          setHasMore(false);
          cursor.current = null;
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
        loadMoreInFlight.current = false;
      }
    },
    [debouncedQuery, locationFilter],
  );

  useFocusEffect(
    useCallback(() => {
      cursor.current = null;
      void load({ append: false, refresh: false });
    }, [load]),
  );

  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger < 1) return;
    cursor.current = null;
    void load({ append: false, refresh: false });
    // `load` queda fuera a propósito: este efecto solo reacciona al disparador
    // externo; los cambios de búsqueda o filtro los recoge el efecto de foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const refresh = useCallback(() => {
    cursor.current = null;
    return load({ append: false, refresh: true });
  }, [load]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || refreshing || loadMoreInFlight.current || !cursor.current) return;
    loadMoreInFlight.current = true;
    void load({ append: true, refresh: false });
  }, [hasMore, loading, refreshing, load]);

  /** El usuario ya escribió pero el debounce todavía no ha disparado. */
  const isSearchDebouncing = searchQuery.trim() !== '' && searchQuery.trim() !== debouncedQuery;

  return {
    orders,
    debouncedQuery,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    serverPaginated,
    isSearchDebouncing,
    refresh,
    loadMore,
  };
}
