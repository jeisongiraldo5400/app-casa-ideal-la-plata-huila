import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { useUserRoles } from '@/hooks/useUserRoles';
import {
  CUSTOMERS_PAGE_SIZE,
  countMyCustomers,
  fetchCustomersPage,
  type CustomerDirectoryRow,
  type CustomersTab,
} from '../services/customersDirectoryService';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Lista de clientes con pestañas, búsqueda y paginación.
 *
 * No hay TanStack Query en esta app ni se usa AbortController: las respuestas
 * viejas se descartan con un contador de petición, como en `useMyOrders`.
 */
export function useCustomersList() {
  const { user } = useAuth();
  const { preferSellerWorkspace, loading: rolesLoading } = useUserRoles();
  const sellerId = user?.id ?? null;

  const [tab, setTab] = useState<CustomersTab>('todos');
  const [tabTouched, setTabTouched] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterSellerId, setFilterSellerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerDirectoryRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myCount, setMyCount] = useState(0);

  const requestId = useRef(0);
  const loadMoreInFlight = useRef(false);

  // Un vendedor entra por sus clientes; admin y bodeguero, por el directorio.
  useEffect(() => {
    if (rolesLoading || tabTouched) return;
    setTab(preferSellerWorkspace() ? 'mios' : 'todos');
  }, [rolesLoading, tabTouched, preferSellerWorkspace]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (options: { page: number; append: boolean; refresh: boolean }) => {
      const id = ++requestId.current;
      if (options.refresh) setRefreshing(true);
      else if (options.append) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await fetchCustomersPage({
          tab,
          sellerId,
          search: debouncedSearch,
          page: options.page,
          pageSize: CUSTOMERS_PAGE_SIZE,
          filterSellerId,
        });
        if (id !== requestId.current) return;
        setCustomers((current) => {
          if (!options.append) return result.customers;
          const known = new Set(current.map((row) => row.id));
          return [...current, ...result.customers.filter((row) => !known.has(row.id))];
        });
        setTotalCount(result.totalCount);
        setHasMore(result.hasMore);
        setFromCache(result.fromCache);
        setPage(options.page);
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'No fue posible cargar los clientes');
        if (!options.append) setCustomers([]);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
          loadMoreInFlight.current = false;
        }
      }
    },
    [tab, sellerId, debouncedSearch, filterSellerId]
  );

  useEffect(() => {
    void load({ page: 1, append: false, refresh: false });
  }, [load]);

  const refreshCount = useCallback(() => {
    if (!sellerId) return;
    void countMyCustomers(sellerId).then(setMyCount);
  }, [sellerId]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const refresh = useCallback(() => {
    refreshCount();
    return load({ page: 1, append: false, refresh: true });
  }, [load, refreshCount]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || refreshing || loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    void load({ page: page + 1, append: true, refresh: false });
  }, [hasMore, loading, refreshing, page, load]);

  const changeTab = useCallback((next: CustomersTab) => {
    setTabTouched(true);
    setTab(next);
    setPage(1);
  }, []);

  const hasFilters = useMemo(
    () => debouncedSearch.length > 0 || Boolean(filterSellerId),
    [debouncedSearch, filterSellerId]
  );

  return {
    tab,
    changeTab,
    search,
    setSearch,
    filterSellerId,
    setFilterSellerId,
    customers,
    totalCount,
    myCount,
    hasMore,
    fromCache,
    loading,
    refreshing,
    loadingMore,
    error,
    hasFilters,
    refresh,
    loadMore,
    reload: () => load({ page: 1, append: false, refresh: false }),
  };
}
