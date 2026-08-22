import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchMyRegisteredDeliveryOrderItems,
  fetchMyRegisteredDeliveryOrders,
  fetchPendingDeliveryOrders,
  PendingDeliveryOrder,
  RegisteredDeliveryOrder,
  RegisteredDeliveryOrderItem,
} from '../services/myOrdersService';

const HISTORY_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

interface OrderDetailState {
  items: RegisteredDeliveryOrderItem[];
  loading: boolean;
  error: string | null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useMyOrders() {
  const [pendingOrders, setPendingOrders] = useState<PendingDeliveryOrder[]>([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingRefreshing, setPendingRefreshing] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

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
    const term = pendingSearch.trim().toLocaleLowerCase('es-CO');
    if (!term) return pendingOrders;
    return pendingOrders.filter((order) =>
      [order.order_number, order.customer_name, order.customer_id_number, order.delivery_address]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es-CO').includes(term)),
    );
  }, [pendingOrders, pendingSearch]);

  const loadPending = useCallback(async (refresh = false) => {
    const requestId = ++pendingRequestId.current;
    if (refresh) setPendingRefreshing(true);
    else setPendingLoading(true);
    setPendingError(null);

    try {
      const orders = await fetchPendingDeliveryOrders();
      if (requestId !== pendingRequestId.current) return;
      setPendingOrders(orders);
    } catch (error) {
      if (requestId !== pendingRequestId.current) return;
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
    } catch (error) {
      if (requestId !== historyRequestId.current) return;
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
      [orderId]: { items: [], loading: true, error: null },
    }));
    try {
      const items = await fetchMyRegisteredDeliveryOrderItems(orderId);
      if (requestId !== detailRequestId.current) return;
      setDetailsByOrderId((current) => ({
        ...current,
        [orderId]: { items, loading: false, error: null },
      }));
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      setDetailsByOrderId((current) => ({
        ...current,
        [orderId]: {
          items: [],
          loading: false,
          error: errorMessage(error, 'No fue posible cargar los productos registrados.'),
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
    loadPending,
    historyOrders,
    historySearch,
    setHistorySearch,
    historyTotalCount,
    historyInitialLoading,
    historyRefreshing,
    historyLoadingMore,
    historyError,
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
