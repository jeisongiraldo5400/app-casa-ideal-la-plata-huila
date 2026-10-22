import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchesDigits, matchesNormalized } from '@/lib/search/normalizeText';
import {
  ExitSerialRecord,
  fetchExitSerialsByExitId,
} from '@/components/exit-serials/infrastructure/services/exitSerialsService';
import {
  fetchMyRegisteredDeliveryOrderItems,
  fetchMyRegisteredDeliveryOrders,
  fetchPendingDeliveryOrders,
  PendingDeliveryOrder,
  RegisteredDeliveryOrder,
  RegisteredDeliveryOrderItem,
} from '../services/myOrdersService';
import { errorMessage } from '@/lib/errorMessage';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { shouldUseLocalOrders } from '@/components/purchase-orders/infrastructure/services/localDeliveryOrdersService';
import { readCachedPendingOrders, saveCachedPendingOrders } from '../services/myOrdersCache';

/** Sin señal no hay historial ni detalle de salidas: se consultan en el servidor. */
export const MY_ORDERS_HISTORY_OFFLINE_MESSAGE = 'Sin señal: tus entregas registradas se consultan con conexión.';
export const MY_ORDERS_DETAIL_OFFLINE_MESSAGE = 'Sin señal: el detalle de tus salidas se consulta con conexión.';

const HISTORY_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

interface OrderDetailState {
  items: RegisteredDeliveryOrderItem[];
  /** Seriales de fábrica por salida; se completan después de los productos. */
  serialsByExitId: Record<string, ExitSerialRecord[]>;
  loading: boolean;
  error: string | null;
}


export function useMyOrders() {
  const [pendingOrders, setPendingOrders] = useState<PendingDeliveryOrder[]>([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingRefreshing, setPendingRefreshing] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  /**
   * Sin señal la lista de pendientes es la última que llegó del servidor
   * (guardada en el teléfono): aquí va cuándo llegó. `null` = del servidor.
   */
  const [pendingSavedAt, setPendingSavedAt] = useState<number | null>(null);
  /** Sin señal: el historial no se pudo consultar (no es un error). */
  const [historyOffline, setHistoryOffline] = useState(false);

  const [historyOrders, setHistoryOrders] = useState<RegisteredDeliveryOrder[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyInitialLoading, setHistoryInitialLoading] = useState(true);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [detailsByOrderId, setDetailsByOrderId] = useState<Record<string, OrderDetailState>>({});

  const pendingRequestId = useRef(0);
  /** Cuándo llegó del servidor la lista de pendientes que se ve (esta sesión). */
  const pendingLoadedAtRef = useRef<number | null>(null);
  const historyRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const loadMoreInFlight = useRef(false);
  const previousDebouncedSearch = useRef('');
  const debouncedHistorySearchRef = useRef('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedHistorySearch(historySearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [historySearch]);

  const filteredPendingOrders = useMemo(() => {
    const term = pendingSearch.trim();
    if (!term) return pendingOrders;
    // Sin tildes: «maria» encuentra «MARÍA». El documento, además, por sus
    // dígitos, para que los puntos al escribir la cédula no estorben.
    return pendingOrders.filter(
      (order) =>
        matchesNormalized(
          term,
          order.order_number,
          order.customer_name,
          order.customer_id_number,
          order.delivery_address,
        ) || matchesDigits(term, order.customer_id_number),
    );
  }, [pendingOrders, pendingSearch]);

  const loadPending = useCallback(async (refresh = false) => {
    const requestId = ++pendingRequestId.current;
    if (refresh) setPendingRefreshing(true);
    else setPendingLoading(true);
    setPendingError(null);

    const userId = useSyncStore.getState().userId;
    // Sin señal (o si la consulta falla por red): la última lista guardada.
    // Si no hay copia guardada pero ya se veía una lista de esta sesión, se
    // deja esa (con su hora) en vez de vaciar la pantalla.
    const loadSaved = async () => {
      const saved = await readCachedPendingOrders(userId);
      if (requestId !== pendingRequestId.current) return;
      if (saved) {
        setPendingOrders(saved.orders);
        setPendingSavedAt(saved.savedAt || pendingLoadedAtRef.current || 0);
      } else {
        setPendingSavedAt(pendingLoadedAtRef.current ?? 0);
      }
    };

    try {
      if (shouldUseLocalOrders()) {
        await loadSaved();
        return;
      }
      const orders = await fetchPendingDeliveryOrders();
      if (requestId !== pendingRequestId.current) return;
      setPendingOrders(orders);
      setPendingSavedAt(null);
      pendingLoadedAtRef.current = Date.now();
      void saveCachedPendingOrders(userId, orders);
    } catch (error) {
      if (requestId !== pendingRequestId.current) return;
      if (shouldUseLocalOrders(error)) {
        await loadSaved();
        return;
      }
      setPendingError(errorMessage(error, 'No fue posible cargar las órdenes asignadas.'));
    } finally {
      if (requestId === pendingRequestId.current) {
        setPendingLoading(false);
        setPendingRefreshing(false);
      }
    }
  }, []);

  const loadHistoryPage = useCallback(async ({
    page,
    append,
    refresh,
    searchTerm,
  }: {
    page: number;
    append: boolean;
    refresh: boolean;
    searchTerm: string;
  }) => {
    const requestId = ++historyRequestId.current;
    if (append) {
      loadMoreInFlight.current = true;
      setHistoryLoadingMore(true);
    } else if (refresh) {
      setHistoryRefreshing(true);
    } else {
      setHistoryInitialLoading(true);
    }
    setHistoryError(null);

    try {
      if (shouldUseLocalOrders()) throw new Error('Sin señal');
      const result = await fetchMyRegisteredDeliveryOrders({
        searchTerm,
        page,
        pageSize: HISTORY_PAGE_SIZE,
      });
      if (requestId !== historyRequestId.current) return;

      setHistoryOrders((current) => {
        if (!append) return result.orders;
        const knownIds = new Set(current.map((order) => order.id));
        return [...current, ...result.orders.filter((order) => !knownIds.has(order.id))];
      });
      setHistoryPage(page);
      if (!append || result.orders.length > 0) setHistoryTotalCount(result.totalCount);
      setHistoryHasMore(result.hasMore);
      setHistoryOffline(false);
    } catch (error) {
      if (requestId !== historyRequestId.current) return;
      // Sin señal no es un fallo: se deja lo que ya se veía y se avisa.
      if (shouldUseLocalOrders(error)) {
        setHistoryOffline(true);
        setHistoryHasMore(false);
        return;
      }
      setHistoryError(errorMessage(error, 'No fue posible cargar las órdenes registradas.'));
    } finally {
      if (requestId === historyRequestId.current) {
        loadMoreInFlight.current = false;
        setHistoryInitialLoading(false);
        setHistoryRefreshing(false);
        setHistoryLoadingMore(false);
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    detailRequestId.current += 1;
    setExpandedOrderId(null);
    setDetailsByOrderId({});
    await Promise.all([
      loadPending(true),
      loadHistoryPage({ page: 1, append: false, refresh: true, searchTerm: debouncedHistorySearchRef.current }),
    ]);
  }, [loadHistoryPage, loadPending]);

  // Al volver (o caerse) la señal se recarga: con señal, lo del servidor.
  const online = useSyncStore((state) => state.online);
  const previousOnline = useRef(online);
  useEffect(() => {
    if (previousOnline.current === online) return;
    previousOnline.current = online;
    void refreshAll();
  }, [online, refreshAll]);

  useEffect(() => {
    debouncedHistorySearchRef.current = debouncedHistorySearch;
    if (previousDebouncedSearch.current === debouncedHistorySearch) return;
    previousDebouncedSearch.current = debouncedHistorySearch;
    detailRequestId.current += 1;
    setExpandedOrderId(null);
    setDetailsByOrderId({});
    void loadHistoryPage({
      page: 1,
      append: false,
      refresh: false,
      searchTerm: debouncedHistorySearch,
    });
  }, [debouncedHistorySearch, loadHistoryPage]);

  const loadMoreHistory = useCallback(() => {
    if (!historyHasMore || historyInitialLoading || historyRefreshing || loadMoreInFlight.current) return;
    void loadHistoryPage({
      page: historyPage + 1,
      append: true,
      refresh: false,
      searchTerm: debouncedHistorySearch,
    });
  }, [debouncedHistorySearch, historyHasMore, historyInitialLoading, historyPage, historyRefreshing, loadHistoryPage]);

  const refreshHistory = useCallback(() => {
    detailRequestId.current += 1;
    setExpandedOrderId(null);
    setDetailsByOrderId({});
    return loadHistoryPage({
      page: 1,
      append: false,
      refresh: true,
      searchTerm: debouncedHistorySearch,
    });
  }, [debouncedHistorySearch, loadHistoryPage]);

  const loadHistoryDetail = useCallback(async (orderId: string) => {
    const requestId = ++detailRequestId.current;
    setDetailsByOrderId((current) => ({
      ...current,
      [orderId]: { items: [], serialsByExitId: {}, loading: true, error: null },
    }));
    try {
      if (shouldUseLocalOrders()) throw new Error('Sin señal');
      const items = await fetchMyRegisteredDeliveryOrderItems(orderId);
      if (requestId !== detailRequestId.current) return;
      setDetailsByOrderId((current) => ({
        ...current,
        [orderId]: { items, serialsByExitId: {}, loading: false, error: null },
      }));

      // Complementarios: nunca lanza; si falla, el detalle queda sin seriales.
      const serialsByExitId = await fetchExitSerialsByExitId(items.map((item) => item.exit_id));
      if (Object.keys(serialsByExitId).length === 0) return;
      setDetailsByOrderId((current) => (
        current[orderId]?.items === items
          ? { ...current, [orderId]: { ...current[orderId], serialsByExitId } }
          : current
      ));
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      setDetailsByOrderId((current) => ({
        ...current,
        [orderId]: {
          items: [],
          serialsByExitId: {},
          loading: false,
          error: shouldUseLocalOrders(error)
            ? MY_ORDERS_DETAIL_OFFLINE_MESSAGE
            : errorMessage(error, 'No fue posible cargar los productos registrados.'),
        },
      }));
    }
  }, []);

  const toggleHistoryOrder = useCallback((orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }

    setExpandedOrderId(orderId);
    if (!detailsByOrderId[orderId]) void loadHistoryDetail(orderId);
  }, [detailsByOrderId, expandedOrderId, loadHistoryDetail]);

  const retryHistoryDetail = useCallback((orderId: string) => {
    void loadHistoryDetail(orderId);
  }, [loadHistoryDetail]);

  return {
    pendingOrders,
    filteredPendingOrders,
    pendingSearch,
    setPendingSearch,
    pendingLoading,
    pendingRefreshing,
    pendingError,
    pendingSavedAt,
    loadPending,
    historyOrders,
    historySearch,
    setHistorySearch,
    historyTotalCount,
    historyInitialLoading,
    historyRefreshing,
    historyLoadingMore,
    historyError,
    historyOffline,
    historyHasMore,
    refreshHistory,
    loadMoreHistory,
    expandedOrderId,
    detailsByOrderId,
    toggleHistoryOrder,
    retryHistoryDetail,
    refreshAll,
  };
}
