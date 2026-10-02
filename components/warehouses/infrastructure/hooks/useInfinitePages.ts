import { useCallback, useEffect, useRef, useState } from 'react';
import { logHandledError } from '@/lib/errorMessage';
import { warehouseErrorMessage } from '../services/warehousesService';

export type PageResult<T> = { rows: T[]; totalCount: number };

type Options<T> = {
  /** Solo consulta con la pantalla a la vista y con señal. */
  enabled: boolean;
  /** Cambia cuando cambian los filtros: vuelve a la página 1. */
  queryKey: string;
  fetchPage: (page: number) => Promise<PageResult<T>>;
  logContext: string;
  errorFallback: string;
};

export type InfinitePagesState<T> = {
  rows: T[];
  totalCount: number;
  /** Ya llegó al menos una respuesta para los filtros actuales. */
  loaded: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

/**
 * Lista paginada que va sumando páginas al llegar al final (FlatList
 * `onEndReached`). Una respuesta vieja (filtros anteriores) nunca pisa a una
 * nueva, y no se piden dos páginas a la vez.
 */
export function useInfinitePages<T>({
  enabled,
  queryKey,
  fetchPage,
  logContext,
  errorFallback,
}: Options<T>): InfinitePagesState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const page = useRef(1);
  const busy = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    busy.current = true;
    setLoading(true);
    try {
      const result = await fetchRef.current(1);
      if (id !== requestId.current) return;
      page.current = 1;
      setRows(result.rows);
      setTotalCount(result.totalCount);
      setError(null);
      setLoaded(true);
    } catch (caught) {
      if (id !== requestId.current) return;
      logHandledError(logContext, caught);
      setError(warehouseErrorMessage(caught, errorFallback));
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setLoading(false);
      }
    }
    // queryKey: cada filtro nuevo es otra consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, logContext, errorFallback]);

  const hasMore = rows.length < totalCount;

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    const id = requestId.current;
    const next = page.current + 1;
    busy.current = true;
    setLoadingMore(true);
    try {
      const result = await fetchRef.current(next);
      if (id !== requestId.current) return;
      page.current = next;
      setRows((current) => [...current, ...result.rows]);
      setTotalCount(result.totalCount);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      logHandledError(logContext, caught);
      setError(warehouseErrorMessage(caught, errorFallback));
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, logContext, errorFallback]);

  // Filtros nuevos: no se muestran las filas de la consulta anterior.
  useEffect(() => {
    setLoaded(false);
    setRows([]);
    setTotalCount(0);
  }, [queryKey]);

  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  return { rows, totalCount, loaded, loading, loadingMore, error, hasMore, reload, loadMore };
}
