import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';
import { PICKER_PAGE_SIZE } from '@/lib/catalogos/constants';
import type { PublicCatalogListingItem } from '@/lib/catalogos/publicCatalogTypes';
import { listPublicCatalogProducts } from '../services/publicCatalogService';

const SEARCH_DEBOUNCE_MS = 300;

export type PublishedProductSearch = {
  query: string;
  setQuery: (value: string) => void;
  /** 0-based para `Pagination`; al RPC se le envía `page + 1`. */
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  items: PublicCatalogListingItem[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Búsqueda de fichas PUBLICADAS para «Enviar un producto».
 *
 * Solo publicadas a propósito: la revista que abre el cliente solo muestra
 * fichas publicadas, así que enviar una en borrador le llegaría vacía. Es la
 * misma consulta que el selector de las ediciones, sin la parte de escribir
 * en una edición (aquí todavía no hay ninguna).
 */
export function usePublishedProductSearch(): PublishedProductSearch {
  const [query, setQueryState] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<PublicCatalogListingItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Una respuesta lenta de una búsqueda anterior no puede pisar la actual.
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const reload = useCallback(async () => {
    const current = (requestId.current += 1);
    setLoading(true);
    setError(null);
    try {
      const result = await listPublicCatalogProducts({
        search: debouncedQuery,
        page: page + 1,
        pageSize: PICKER_PAGE_SIZE,
      });
      if (current !== requestId.current) return;
      setItems(result.items);
      setTotalCount(result.totalCount);
    } catch (caught) {
      if (current !== requestId.current) return;
      setError(errorMessage(caught, 'No se pudieron cargar los productos'));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setPage(0);
  }, []);

  return { query, setQuery, page, setPage, pageSize: PICKER_PAGE_SIZE, items, totalCount, loading, error, reload };
}
