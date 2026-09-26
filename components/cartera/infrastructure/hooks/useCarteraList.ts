import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { DEFAULT_CARTERA_FILTERS, type CarteraFilterValues } from '@/components/cartera/CarteraFilterModal';
import type { CarteraDashboard, CarteraRow } from '@/lib/cartera/carteraService';
import { loadCarteraScreen } from '@/lib/cartera/loadCarteraScreen';
import { carteraFiltersKey, getCarteraStamp, invalidateCartera, markCarteraLoaded, needsCarteraRefresh } from '@/lib/cartera/carteraCache';
import { EMPTY_CARTERA_CATALOGS, loadCarteraCatalogs, type CarteraCatalogs } from '@/lib/cartera/carteraCatalogs';
import { parseCarteraDueParam } from '@/lib/cartera/carteraDeepLink';
import { clearCarteraFilters, dueRangeError } from '@/lib/cartera/carteraFilters';
import { errorMessage } from '@/lib/errorMessage';

const PAGE_SIZE = 10;
const INITIAL_FILTERS: CarteraFilterValues = DEFAULT_CARTERA_FILTERS;

/**
 * Estado y carga del listado de Cartera: filtros (aplicados y borrador del
 * modal), paginación, tablero y catálogos. La pantalla solo compone la UI.
 *
 * `searchOnly`: el recaudador cobra en cualquier negocio pero no recorre la
 * cartera; solo ve lo que busca (20261125120000). El servidor no le devuelve
 * nada sin término, así que sin término ni se pide.
 */
export function useCarteraList({ searchOnly }: { searchOnly: boolean }) {
  const router = useRouter();
  const [filters, setFilters] = useState<CarteraFilterValues>(INITIAL_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CarteraFilterValues>(INITIAL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rows, setRows] = useState<CarteraRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<CarteraDashboard | null>(null);
  // Municipios, vendedores y métodos de pago: los tres a la vez y una sola vez por sesión.
  const [catalogs, setCatalogs] = useState<CarteraCatalogs>(EMPTY_CARTERA_CATALOGS);
  const [fromCache, setFromCache] = useState(false);
  // Esta instancia ya tiene datos en pantalla. La marca de frescura vive en el
  // módulo y sobrevive a un remontaje; sin este pestillo, una pantalla recién
  // montada con la marca fresca se quedaría vacía y sin pedir nada.
  const hasRows = useRef(false);
  // Cada carga lleva un número: la respuesta de una consulta vieja (filtros o
  // búsqueda que ya cambiaron) no pisa la lista de la consulta vigente.
  const requestSeq = useRef(0);

  // `force` salta la caché de frescura: lo usan el botón de recargar y el tirón
  // para refrescar, que siempre tienen que pedir de verdad.
  const load = useCallback(
    async (target: number = 1, reset: boolean = true, options?: { force?: boolean }) => {
      const key = carteraFiltersKey(filters);
      // Volver a la pantalla con los mismos filtros y datos recientes no vuelve a
      // pedir nada; paginar («cargar más») siempre pide.
      if (reset && !options?.force && hasRows.current && !needsCarteraRefresh(getCarteraStamp(), key, Date.now())) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const seq = ++requestSeq.current;
      // Sin término, al recaudador el servidor no le devuelve cuotas: no se pide.
      if (searchOnly && (filters.search || '').trim().length === 0) {
        hasRows.current = false;
        setRows([]);
        setTotalCount(0);
        setDashboard(null);
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
        return;
      }
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await loadCarteraScreen({ ...filters, page: target, pageSize: PAGE_SIZE, includeDashboard: reset });
        if (seq !== requestSeq.current) return;
        setRows((current) => (reset ? result.rows : [...current, ...result.rows]));
        setTotalCount(result.totalCount);
        setPage(target);
        setFromCache(result.fromCache);
        if (result.dashboard) setDashboard(result.dashboard);
        if (reset) {
          hasRows.current = true;
          markCarteraLoaded(key);
        }
      } catch (e) {
        if (seq !== requestSeq.current) return;
        if (reset) {
          hasRows.current = false;
          setRows([]);
          setTotalCount(0);
          setFromCache(false);
        }
        Alert.alert('Cartera', errorMessage(e, 'No fue posible cargar la información'));
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [filters, searchOnly]
  );

  useFocusEffect(
    useCallback(() => {
      void load(1, true);
    }, [load])
  );

  // El detalle del negocio es donde se registran y se anulan los pagos: al
  // volver de allí la cartera se vuelve a pedir aunque hayan pasado segundos.
  const openNegocio = useCallback(
    (id: string) => {
      invalidateCartera();
      router.push(`/negocio/${id}`);
    },
    [router]
  );

  // Un recordatorio de cobro abre Cartera con `?due=YYYY-MM-DD&n=<aviso>`. Es un efecto y no el estado
  // inicial porque la pestaña conserva su estado: si ya estaba abierta, solo cambian los parámetros.
  const params = useLocalSearchParams<{ due?: string; n?: string }>();
  useEffect(() => {
    const due = parseCarteraDueParam(params.due);
    if (!due) return;
    const next: CarteraFilterValues = { ...INITIAL_FILTERS, dueFrom: due, dueTo: due };
    setFilters(next);
    setDraftFilters(next);
  }, [params.due, params.n]);

  useEffect(() => {
    let alive = true;
    void loadCarteraCatalogs().then((next) => {
      if (alive) setCatalogs(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(true);
  };
  // Aplicar reemplaza los filtros (y con ellos la clave de carga): la lista
  // vuelve a la página 1. Cerrar sin aplicar descarta el borrador.
  const applyFilters = () => {
    if (dueRangeError(draftFilters.dueFrom, draftFilters.dueTo)) return;
    setFilters(draftFilters);
    setFiltersOpen(false);
  };
  const cancelFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(false);
  };
  const clearFilters = () => {
    const next = clearCarteraFilters(filters, INITIAL_FILTERS);
    setFilters(next);
    setDraftFilters(next);
  };
  const changeSearch = useCallback((term: string) => {
    setFilters((current) => (current.search === term ? current : { ...current, search: term }));
    setDraftFilters((current) => ({ ...current, search: term }));
  }, []);

  const refresh = () => {
    setRefreshing(true);
    void load(1, true, { force: true });
  };
  const reload = () => void load(1, true, { force: true });
  const loadMore = () => void load(page + 1, false);

  return {
    filters,
    draftFilters,
    setDraftFilters,
    filtersOpen,
    openFilters,
    applyFilters,
    cancelFilters,
    clearFilters,
    changeSearch,
    rows,
    totalCount,
    loading,
    loadingMore,
    refreshing,
    dashboard,
    catalogs,
    fromCache,
    refresh,
    reload,
    loadMore,
    openNegocio,
  };
}
