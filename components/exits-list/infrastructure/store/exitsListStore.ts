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
}

interface ExitsListState {
  exits: ExitListItem[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  // Paginación
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  loadExits: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  loadNextPage: () => Promise<void>;
  clearError: () => void;
}

export const useExitsListStore = create<ExitsListState>((set, get) => ({
  exits: [],
  loading: false,
  error: null,
  searchQuery: '',
  currentPage: 1,
  pageSize: 50,
  totalCount: 0,
  hasMore: false,

  loadExits: async () => {
    const { searchQuery, currentPage, pageSize } = get();

    set({ loading: true, error: null });

    try {
      // OPTIMIZADO: Usar RPC get_inventory_exits_dashboard con paginación y búsqueda del lado del servidor
      const { data, error } = await supabase.rpc('get_inventory_exits_dashboard', {
        page: currentPage,
        page_size: pageSize,
        search_term: searchQuery || null,
      });

      if (error) {
        console.error('Error loading exits:', error);
        set({ exits: [], loading: false, error: error.message });
        return;
      }

      if (!data || data.length === 0) {
        set({ exits: [], loading: false, totalCount: 0, hasMore: false });
        return;
      }

      // El primer resultado contiene total_count para paginación
      const totalCount = data[0]?.total_count || 0;

      // Transformar datos del RPC al formato de ExitListItem
      const exitItems: ExitListItem[] = data.map((item: ExitDashboardResult) => ({
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
      }));

      const hasMore = totalCount > currentPage * pageSize;

      set({
        exits: exitItems,
        loading: false,
        totalCount,
        hasMore,
      });
    } catch (error: any) {
      console.error('Error loading exits (catch):', error);
      set({ exits: [], loading: false, error: error.message || 'Error al cargar las salidas' });
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, currentPage: 1 });
    // Debounce se maneja en el componente, aquí solo actualizamos el estado
  },

  setPage: (page) => {
    set({ currentPage: page });
    get().loadExits();
  },

  setPageSize: (size) => {
    set({ pageSize: size, currentPage: 1 });
    get().loadExits();
  },

  loadNextPage: async () => {
    const { currentPage, hasMore, loading } = get();
    if (!hasMore || loading) return;

    set({ currentPage: currentPage + 1 });
    await get().loadExits();
  },

  clearError: () => {
    set({ error: null });
  },
}));
