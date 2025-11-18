import { supabase } from '@/lib/supabase';
import { create } from 'zustand';
import { Database } from '@/types/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];
type WarehouseStock = Database['public']['Tables']['warehouse_stock']['Row'];

export interface InventoryItem {
  id: string;
  product: Product;
  warehouse: Warehouse;
  quantity: number;
  updated_at: string;
}

interface InventoryState {
  inventory: InventoryItem[];
  warehouses: Warehouse[];
  selectedWarehouseId: string | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  loadWarehouses: () => Promise<void>;
  loadInventory: (warehouseId?: string) => Promise<void>;
  updateStock: (productId: string, warehouseId: string, quantity: number) => Promise<{ error: any }>;
  setSelectedWarehouse: (warehouseId: string | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventory: [],
  warehouses: [],
  selectedWarehouseId: null,
  loading: false,
  error: null,
  searchQuery: '',

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
    const { selectedWarehouseId } = get();
    const targetWarehouseId = warehouseId || selectedWarehouseId;

    set({ loading: true, error: null });

    try {
      let query = supabase
        .from('warehouse_stock')
        .select(`
          *,
          product:products(*),
          warehouse:warehouses(*)
        `)
        .order('updated_at', { ascending: false });

      if (targetWarehouseId) {
        query = query.eq('warehouse_id', targetWarehouseId);
      }

      const { data, error } = await query;

      if (error) {
        // Solo loggear errores críticos, no errores de permisos o tablas vacías
        if (error.code !== 'PGRST116' && error.code !== '42P01') {
          console.warn('Error loading inventory:', error.message);
        }
        set({ inventory: [], loading: false, error: null });
        return;
      }

      // Validar que los datos tengan la estructura esperada
      const inventoryItems: InventoryItem[] = (data || [])
        .filter((item: any) => item.product && item.warehouse) // Filtrar items con datos incompletos
        .map((item: any) => ({
          id: item.id,
          product: item.product,
          warehouse: item.warehouse,
          quantity: item.quantity || 0,
          updated_at: item.updated_at,
        }));

      set({ inventory: inventoryItems, loading: false });
    } catch (error: any) {
      // Solo loggear errores inesperados
      if (error?.message && !error.message.includes('permission')) {
        console.warn('Error loading inventory:', error.message);
      }
      set({ inventory: [], loading: false, error: null });
    }
  },

  updateStock: async (productId: string, warehouseId: string, quantity: number) => {
    set({ loading: true, error: null });

    try {
      // Verificar si ya existe un registro de stock para este producto y bodega
      const { data: existingStock, error: checkError } = await supabase
        .from('warehouse_stock')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('warehouse_id', warehouseId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 es el código cuando no se encuentra ningún registro
        set({ loading: false, error: checkError.message });
        return { error: checkError };
      }

      if (existingStock) {
        // Actualizar stock existente
        const { error: updateError } = await supabase
          .from('warehouse_stock')
          .update({
            quantity: quantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingStock.id);

        if (updateError) {
          set({ loading: false, error: updateError.message });
          return { error: updateError };
        }
      } else {
        // Crear nuevo registro de stock
        const { error: insertError } = await supabase
          .from('warehouse_stock')
          .insert({
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: quantity,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          set({ loading: false, error: insertError.message });
          return { error: insertError };
        }
      }

      // Recargar el inventario después de actualizar
      await get().loadInventory();

      set({ loading: false });
      return { error: null };
    } catch (error: any) {
      console.error('Error updating stock:', error);
      set({ loading: false, error: error.message || 'Error al actualizar el stock' });
      return { error };
    }
  },

  setSelectedWarehouse: (warehouseId) => {
    set({ selectedWarehouseId: warehouseId });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  clearError: () => {
    set({ error: null });
  },
}));


