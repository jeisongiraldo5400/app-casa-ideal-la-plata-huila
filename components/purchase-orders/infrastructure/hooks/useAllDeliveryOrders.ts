import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeliveryLocationFilter } from '../../domain/deliveryLocation';
import { DeliveryOrder } from '../../types';
import { errorMessage } from '@/lib/errorMessage';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  DELIVERY_ORDERS_PAGE_SIZE,
  DeliveryOrdersCursor,
  fetchDeliveryOrdersPage,
} from '../services/deliveryOrdersPageService';
import { listLocalDeliveryOrders, shouldUseLocalOrders } from '../services/localDeliveryOrdersService';

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
  /** Lo visible salió del teléfono (sin señal), no del servidor. */
  const [fromLocal, setFromLocal] = useState(false);
  /** Momento de la descarga de lo que se ve, si `fromLocal`. */
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null);

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

      // Sin señal: las órdenes llevadas en el teléfono. Una página siguiente
      // no existe (la lista local llega entera de una vez).
      const loadLocal = async () => {
        const local = await listLocalDeliveryOrders({ search: debouncedQuery, location: locationFilter });
        if (id !== requestId.current) return;
        setOrders(local.orders);
        cursor.current = null;
        setHasMore(false);
        setServerPaginated(false);
        setFromLocal(true);
        setSnapshotAt(local.snapshotAt);
        setError(null);
      };

      try {
        if (shouldUseLocalOrders()) {
          if (!options.append) await loadLocal();
          return;
        }
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
        setFromLocal(false);
        setSnapshotAt(null);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        // Se cayó la señal (o no respondió a tiempo): lo guardado en el
        // teléfono en vez del error. En una página siguiente se deja lo ya
        // visible y se avisa al pie, como antes.
        if (!options.append && shouldUseLocalOrders(err)) {
          try {
            await loadLocal();
            return;
          } catch {
            // Sin base local: se muestra el error de la consulta.
          }
        }
        // Traducido: el usuario no debe leer el texto técnico de la red.
        setError(errorMessage(err, 'No se pudieron cargar las órdenes de entrega'));
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

  // Al perder o recuperar la señal se vuelve a la primera página: sin señal
  // salen las órdenes del teléfono y con señal otra vez las del servidor.
  const online = useSyncStore((state) => state.online);
  const previousOnline = useRef(online);
  useEffect(() => {
    if (previousOnline.current === online) return;
    previousOnline.current = online;
    cursor.current = null;
    void load({ append: false, refresh: false });
    // Igual que el disparador externo: sólo reacciona al cambio de señal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

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
    fromLocal,
    snapshotAt,
    isSearchDebouncing,
    refresh,
    loadMore,
  };
}
