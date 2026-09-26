import { useCallback, useRef, useState } from 'react';
import { errorMessage, logHandledError } from '@/lib/errorMessage';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  EMPTY_NEGOCIOS_SUMMARY,
  type NegocioListRow,
  type NegociosListFilters,
  type NegociosListSummary,
  type NegociosScope,
} from '@/lib/negocios/negociosListQuery';
import { fetchNegociosFromLocal, fetchNegociosPage } from '../services/negociosListService';

/** Filas por página con señal. */
export const NEGOCIOS_PAGE_SIZE = 50;

export type UseNegociosListParams = {
  scope: NegociosScope;
  /** Por cobrar: gestor elegido por el admin (null = uno mismo). */
  gestorId: string | null;
  /** Término ya «reposado» (debounce en la pantalla). */
  search: string;
  filters: NegociosListFilters;
  userId: string | null;
  /** Recaudador «puro»: sin término no hay lista que pedir. */
  searchOnly: boolean;
  /** Falso mientras falta algo para consultar (p. ej. admin sin gestor elegido). */
  enabled: boolean;
};

export type NegociosListState = {
  rows: NegocioListRow[];
  summary: NegociosListSummary;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  fromCache: boolean;
  hasMore: boolean;
};

const INITIAL: NegociosListState = {
  rows: [],
  summary: EMPTY_NEGOCIOS_SUMMARY,
  loading: false,
  loadingMore: false,
  error: null,
  fromCache: false,
  hasMore: false,
};

/**
 * Lista de Negocios: servidor con paginación y, sin señal, la base local con
 * los mismos filtros. Cada consulta lleva un número: si llega una respuesta
 * vieja (el usuario cambió de pestaña o de filtro) se descarta.
 */
export function useNegociosList(params: UseNegociosListParams) {
  const [state, setState] = useState<NegociosListState>(INITIAL);
  const request = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { scope, gestorId, search, filters, userId, searchOnly, enabled } = params;

  const reload = useCallback(async () => {
    const current = ++request.current;
    if (!enabled || !userId || (scope === 'todos' && searchOnly && !search.trim())) {
      setState(INITIAL);
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const page = await fetchNegociosPage({ scope, gestorId, search, filters, limit: NEGOCIOS_PAGE_SIZE, offset: 0 });
      if (current !== request.current) return;
      setState({
        rows: page.rows,
        summary: page.summary,
        loading: false,
        loadingMore: false,
        error: null,
        fromCache: false,
        hasMore: page.rows.length < page.summary.totalCount,
      });
    } catch (error) {
      if (current !== request.current) return;
      if (isNetworkError(error)) {
        const local = await fetchNegociosFromLocal({ scope, userId, gestorId, search, filters, searchOnly }).catch(
          () => null
        );
        if (current !== request.current) return;
        if (local) {
          setState({ ...INITIAL, rows: local.rows, summary: local.summary, fromCache: true });
          return;
        }
      }
      logHandledError('No se pudieron cargar los negocios', error);
      // Se conserva la lista anterior: un fallo pasajero no vacía la pantalla.
      setState((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage(error, 'No se pudieron cargar los negocios'),
      }));
    }
  }, [enabled, filters, gestorId, scope, search, searchOnly, userId]);

  const loadMore = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!enabled || snapshot.fromCache || !snapshot.hasMore || snapshot.loading || snapshot.loadingMore) return;
    const current = request.current;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await fetchNegociosPage({
        scope,
        gestorId,
        search,
        filters,
        limit: NEGOCIOS_PAGE_SIZE,
        offset: snapshot.rows.length,
      });
      if (current !== request.current) return;
      setState((prev) => {
        const seen = new Set(prev.rows.map((row) => row.id));
        const rows = [...prev.rows, ...page.rows.filter((row) => !seen.has(row.id))];
        return {
          ...prev,
          rows,
          summary: page.summary,
          loadingMore: false,
          hasMore: page.rows.length > 0 && rows.length < page.summary.totalCount,
        };
      });
    } catch (error) {
      if (current !== request.current) return;
      logHandledError('No se pudieron cargar más negocios', error);
      setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }, [enabled, filters, gestorId, scope, search]);

  return { ...state, reload, loadMore };
}
