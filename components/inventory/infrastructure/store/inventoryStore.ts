import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

import { Database } from '@/types/database.types';

type Product = Database['public']['Tables']['products']['Row'];
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

interface InventoryState {
  inventory: InventoryItem[];
  warehouses: Warehouse[];
  selectedWarehouseId: string | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  // Paginación
  currentPage: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  loadWarehouses: () => Promise<void>;
  loadInventory: (warehouseId?: string) => Promise<void>;
  setSelectedWarehouse: (warehouseId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  loadNextPage: () => Promise<void>;
  clearError: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventory: [],
  warehouses: [],
  selectedWarehouseId: null,
  loading: false,
  error: null,
  searchQuery: '',
  currentPage: 1,
  pageSize: 50,
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

  loadInventory: async (warehouseId?: string) => {
    const { searchQuery, currentPage, pageSize } = get();
    const targetWarehouseId = warehouseId || get().selectedWarehouseId;

    set({ loading: true, error: null });

    try {
      // OPTIMIZADO: Usar RPC get_products_dashboard con paginación y búsqueda del lado del servidor
      const { data, error } = await supabase.rpc('get_products_dashboard', {
        page: currentPage,
        page_size: pageSize,
        search_term: searchQuery || null,
      });

      if (error) {
        console.error('Error loading inventory:', error);
        set({ inventory: [], loading: false, error: error.message });
        return;
      }

      if (!data || data.length === 0) {
        set({ inventory: [], loading: false, totalCount: 0, hasMore: false });
        return;
      }

      // El primer resultado contiene total_count para paginación
      const totalCount = data[0]?.total_count || 0;

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

      // Filtrar por bodega si está seleccionada (filtro del lado del cliente para warehouse)
      const filteredItems = targetWarehouseId
        ? inventoryItems.filter(item => item.stock_by_warehouse[targetWarehouseId])
        : inventoryItems;

      const hasMore = totalCount > currentPage * pageSize;

      set({
        inventory: filteredItems,
        loading: false,
        totalCount,
        hasMore,
      });
    } catch (error: any) {
      console.error('Error loading inventory (catch):', error);
      set({ inventory: [], loading: false, error: error.message || 'Error al cargar el inventario' });
    }
  },

  setSelectedWarehouse: (warehouseId) => {
    set({ selectedWarehouseId: warehouseId, currentPage: 1 });
    // Recargar inventario con el nuevo filtro
    get().loadInventory(warehouseId || undefined);
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query, currentPage: 1 });
    // Debounce se maneja en el componente, aquí solo actualizamos el estado
  },

  setPage: (page) => {
    set({ currentPage: page });
    get().loadInventory();
  },

  setPageSize: (size) => {
    set({ pageSize: size, currentPage: 1 });
    get().loadInventory();
  },

  loadNextPage: async () => {
    const { currentPage, hasMore, loading } = get();
    if (!hasMore || loading) return;

    set({ currentPage: currentPage + 1 });
    await get().loadInventory();
  },

  clearError: () => {
    set({ error: null });
  },
}));
