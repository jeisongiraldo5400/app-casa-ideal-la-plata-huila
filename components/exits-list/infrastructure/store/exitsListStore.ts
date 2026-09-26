import {
  ExitSerialRecord,
  fetchExitSerialsByExitId,
} from '@/components/exit-serials/infrastructure/services/exitSerialsService';
import { errorMessage, logHandledError } from '@/lib/errorMessage';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { create } from 'zustand';

// Tipo para el resultado de get_inventory_exits_dashboard RPC
type ExitDashboardResult = Database['public']['Functions']['get_inventory_exits_dashboard']['Returns'][0];

export interface ExitListItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_barcode: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  created_at: string;
  created_by: string;
  created_by_name: string;
  barcode_scanned: string;
  is_cancelled: boolean;
  cancellation_id: string | null;
  cancellation_observations: string | null;
  cancellation_created_at: string | null;
  /** Seriales de fábrica de la salida; llegan en una segunda consulta (vacío si no hay o si falló). */
  serials: ExitSerialRecord[];
}

interface ExitsListState {
  exits: ExitListItem[];
  loading: boolean;
  /** Cargando la página siguiente (la lista actual se conserva). */
  loadingMore: boolean;
  error: string | null;
  /** Fallo al traer la página siguiente: no borra lo ya cargado. */
  loadMoreError: string | null;
  searchQuery: string;
  // Paginación
  currentPage: number;
  pageSize: number;
  /** Total real de salidas que cumplen la búsqueda (no solo las cargadas). */
  totalCount: number;
  hasMore: boolean;
  /** Recarga desde la primera página (abrir pantalla, deslizar para refrescar, reintentar). */
  loadExits: () => Promise<void>;
  /** Actualiza el término sin consultar (la barra de búsqueda aplica el debounce). */
  setSearchQuery: (query: string) => void;
  /** Aplica un término y recarga desde la primera página si cambió. */
  searchExits: (query: string) => Promise<void>;
  /** Trae la página siguiente y la agrega al final de la lista. */
  loadNextPage: () => Promise<void>;
  clearError: () => void;
}

// Descarta respuestas de cargas anteriores (búsqueda escrita rápido, paginación).
let latestLoadId = 0;

function toExitListItem(item: ExitDashboardResult): ExitListItem {
  return {
    id: item.id,
    product_id: item.product_id,
    product_name: item.product_name,
    product_sku: item.product_sku,
    product_barcode: item.product_barcode,
    warehouse_id: item.warehouse_id,
    warehouse_name: item.warehouse_name,
    quantity: item.quantity,
    created_at: item.created_at,
    created_by: item.created_by,
    created_by_name: item.created_by_name,
    barcode_scanned: item.barcode_scanned,
    is_cancelled: item.is_cancelled,
    cancellation_id: item.cancellation_id,
    cancellation_observations: item.cancellation_observations,
    cancellation_created_at: item.cancellation_created_at,
    serials: [],
  };
}

type PageResult =
  | { ok: true; items: ExitListItem[]; totalCount: number }
  | { ok: false; error: unknown };

async function fetchExitsPage(page: number, pageSize: number, searchQuery: string): Promise<PageResult> {
  try {
    // Paginación y búsqueda del lado del servidor (también busca por serial de fábrica).
    const { data, error } = await supabase.rpc('get_inventory_exits_dashboard', {
      page,
      page_size: pageSize,
      search_term: searchQuery || null,
    });
    if (error) return { ok: false, error };
    const rows = data ?? [];
    // Cada fila trae total_count (el mismo en todas).
    return { ok: true, items: rows.map(toExitListItem), totalCount: Number(rows[0]?.total_count ?? 0) };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}

export const useExitsListStore = create<ExitsListState>((set, get) => {
  /** Agrega los seriales cuando lleguen; nunca lanza (sin red el historial queda sin seriales). */
  const attachSerials = async (loadId: number, ids: string[]) => {
    if (ids.length === 0) return;
    const serialsByExitId = await fetchExitSerialsByExitId(ids);
    if (loadId !== latestLoadId || Object.keys(serialsByExitId).length === 0) return;
    set((state) => ({
      exits: state.exits.map((item) => ({ ...item, serials: serialsByExitId[item.id] ?? item.serials })),
    }));
  };

  return {
    exits: [],
    loading: false,
    loadingMore: false,
    error: null,
    loadMoreError: null,
    searchQuery: '',
    currentPage: 1,
    pageSize: 50,
    totalCount: 0,
    hasMore: false,

    loadExits: async () => {
      const { searchQuery, pageSize } = get();
      const loadId = ++latestLoadId;
      set({ loading: true, loadingMore: false, error: null, loadMoreError: null, currentPage: 1 });

      const result = await fetchExitsPage(1, pageSize, searchQuery);
      if (loadId !== latestLoadId) return;

      if (!result.ok) {
        // El mensaje se guarda ya traducido: la lista lo muestra tal cual y el
        // usuario no lee "TypeError: Network request failed".
        logHandledError('Error loading exits', result.error);
        set({
          exits: [],
          loading: false,
          totalCount: 0,
          hasMore: false,
          error: errorMessage(result.error, 'No se pudieron cargar las salidas'),
        });
        return;
      }

      set({
        exits: result.items,
        loading: false,
        totalCount: result.totalCount,
        hasMore: result.totalCount > pageSize,
      });
      await attachSerials(loadId, result.items.map((item) => item.id));
    },

    setSearchQuery: (query: string) => {
      set({ searchQuery: query, currentPage: 1 });
    },

    searchExits: async (query: string) => {
      if (query === get().searchQuery) return;
      set({ searchQuery: query, currentPage: 1 });
      await get().loadExits();
    },

    loadNextPage: async () => {
      const { currentPage, hasMore, loading, loadingMore, pageSize, searchQuery } = get();
      if (!hasMore || loading || loadingMore) return;
      const loadId = ++latestLoadId;
      const nextPage = currentPage + 1;
      set({ loadingMore: true, loadMoreError: null });

      const result = await fetchExitsPage(nextPage, pageSize, searchQuery);
      if (loadId !== latestLoadId) return;

      if (!result.ok) {
        logHandledError('Error loading more exits', result.error);
        set({
          loadingMore: false,
          loadMoreError: errorMessage(result.error, 'No se pudieron cargar más salidas'),
        });
        return;
      }

      set((state) => {
        // Si entraron salidas nuevas entre páginas, la siguiente puede repetir filas.
        const known = new Set(state.exits.map((item) => item.id));
        const exits = [...state.exits, ...result.items.filter((item) => !known.has(item.id))];
        return {
          exits,
          loadingMore: false,
          currentPage: nextPage,
          totalCount: result.totalCount,
          hasMore: result.items.length > 0 && result.totalCount > nextPage * pageSize,
        };
      });
      await attachSerials(loadId, result.items.map((item) => item.id));
    },

    clearError: () => {
      set({ error: null, loadMoreError: null });
    },
  };
});
