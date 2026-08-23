import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

import { Database } from '@/types/database.types';

type Warehouse = Database['public']['Tables']['warehouses']['Row'];

// Tipo para el resultado de get_products_dashboard RPC
type ProductDashboardResult = Database['public']['Functions']['get_products_dashboard']['Returns'][0];

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand_name: string;
  category_name: string;
  color_name: string | null;
  total_stock: number;
  stock_by_warehouse: Record<string, { warehouse_id: string; warehouse_name: string; quantity: number }>;
  status: boolean;
  created_at: string;
}

interface InventoryLoadOptions {
  page?: number;
  append?: boolean;
  refreshing?: boolean;
  warehouseId?: string | null;
}

interface InventoryState {
  inventory: InventoryItem[];
  warehouses: Warehouse[];
  selectedWarehouseId: string | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  searchQuery: string;
  // Paginación
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  loadWarehouses: () => Promise<void>;
  loadInventory: (options?: InventoryLoadOptions) => Promise<void>;
  refreshInventory: () => Promise<void>;
  setSelectedWarehouse: (warehouseId: string | null) => void;
  setSearchQuery: (query: string) => void;
  loadNextPage: () => Promise<void>;
  clearError: () => void;
}

let latestInventoryRequestId = 0;

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventory: [],
  warehouses: [],
  selectedWarehouseId: null,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null,
  searchQuery: '',
  currentPage: 1,
  pageSize: 20,
  totalCount: 0,
  hasMore: false,

  loadWarehouses: async () => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        // Solo loggear errores críticos, no errores de permisos o tablas vacías
        if (error.code !== 'PGRST116' && error.code !== '42P01') {
          console.warn('Error loading warehouses:', error.message);
        }
        set({ warehouses: [] });
        return;
      }
      set({ warehouses: data || [] });
    } catch (error: any) {
      // Solo loggear errores inesperados
      if (error?.message && !error.message.includes('permission')) {
        console.warn('Error loading warehouses:', error.message);
      }
      set({ warehouses: [] });
    }
  },

  loadInventory: async (options = {}) => {
    const { searchQuery, pageSize, selectedWarehouseId } = get();
    const page = options.page ?? 1;
    const append = options.append ?? false;
    const refreshing = options.refreshing ?? false;
    const targetWarehouseId = options.warehouseId === undefined
      ? selectedWarehouseId
      : options.warehouseId;
    const requestId = ++latestInventoryRequestId;

    set({
      loading: !append && !refreshing,
      refreshing,
      loadingMore: append,
      error: null,
    });

    try {
      const { data, error } = await supabase.rpc('get_products_dashboard', {
        page,
        page_size: pageSize,
        search_term: searchQuery || null,
        include_deleted: false,
        ...(targetWarehouseId ? { p_warehouse_id: targetWarehouseId } : {}),
      });

      if (requestId !== latestInventoryRequestId) return;

      if (error) {
        console.error('Error loading inventory:', error);
        set({
          loading: false,
          refreshing: false,
          loadingMore: false,
          error: error.message,
        });
        return;
      }

      if (!data || data.length === 0) {
        set((state) => ({
          inventory: append ? state.inventory : [],
          currentPage: append ? state.currentPage : 1,
          loading: false,
          refreshing: false,
          loadingMore: false,
          totalCount: append ? state.inventory.length : 0,
          hasMore: false,
        }));
        return;
      }

      // El primer resultado contiene total_count para paginación
      const totalCount = Number(data[0]?.total_count || 0);

      // Transformar datos del RPC al formato de InventoryItem
      const inventoryItems: InventoryItem[] = data.map((item: ProductDashboardResult) => {
        // Parsear stock_by_warehouse (viene como JSON)
        let stockByWarehouse: Record<string, { warehouse_id: string; warehouse_name: string; quantity: number }> = {};

        try {
          if (item.stock_by_warehouse) {
            const stockArray = item.stock_by_warehouse as any[];
            stockArray.forEach((stock: any) => {
              // Solo incluir bodegas con stock mayor a 0
              const quantity = stock.quantity || 0;
              if (quantity > 0) {
                // Usar warehouseId como viene de la BD (camelCase)
                // Compatibilidad con ambos formatos por si acaso hay datos en diferentes formatos
                const warehouseId = stock.warehouseId || stock.warehouse_id;
                stockByWarehouse[warehouseId] = {
                  warehouse_id: warehouseId,
                  warehouse_name: stock.warehouseName || stock.warehouse_name,
                  quantity: quantity,
                };
              }
            });
          }
        } catch (e) {
          console.warn('Error parsing stock_by_warehouse:', e);
        }

        return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          brand_name: item.brand_name,
          category_name: item.category_name,
          color_name: item.color_name || null,
          total_stock: item.total_stock,
          stock_by_warehouse: stockByWarehouse,
          status: item.status,
          created_at: item.created_at,
        };
      });

      const hasMore = totalCount > page * pageSize;

      set((state) => ({
        inventory: append
          ? [
              ...state.inventory,
              ...inventoryItems.filter(
                (item) => !state.inventory.some((current) => current.id === item.id)
              ),
            ]
          : inventoryItems,
        currentPage: page,
        loading: false,
        refreshing: false,
        loadingMore: false,
        totalCount,
        hasMore,
      }));
    } catch (error: any) {
      if (requestId !== latestInventoryRequestId) return;
      console.error('Error loading inventory (catch):', error);
      set({
        loading: false,
        refreshing: false,
        loadingMore: false,
        error: error.message || 'Error al cargar el inventario',
      });
    }
  },

  refreshInventory: async () => {
    await get().loadInventory({ page: 1, refreshing: true });
  },

  setSelectedWarehouse: (warehouseId) => {
    if (warehouseId === get().selectedWarehouseId) return;
    latestInventoryRequestId += 1;
    set({
      selectedWarehouseId: warehouseId,
      inventory: [],
      currentPage: 1,
      totalCount: 0,
      hasMore: false,
      loading: false,
      refreshing: false,
      loadingMore: false,
      error: null,
    });
    void get().loadInventory({ page: 1, warehouseId });
  },

  setSearchQuery: (query) => {
    if (query === get().searchQuery) return;
    latestInventoryRequestId += 1;
    set({
      searchQuery: query,
      inventory: [],
      currentPage: 1,
      totalCount: 0,
      hasMore: false,
      loading: false,
      refreshing: false,
      loadingMore: false,
      error: null,
    });
  },

  loadNextPage: async () => {
    const { currentPage, hasMore, loading, refreshing, loadingMore } = get();
    if (!hasMore || loading || refreshing || loadingMore) return;

    await get().loadInventory({ page: currentPage + 1, append: true });
  },

  clearError: () => {
    set({ error: null });
  },
}));
