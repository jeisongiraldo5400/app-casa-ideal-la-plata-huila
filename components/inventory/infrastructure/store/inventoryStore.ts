import { supabase } from '@/lib/supabase';
import { create } from 'zustand';
// eslint-disable-next-line import/namespace
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
      // Consulta con joins usando foreign keys
      let query = supabase
        .from('warehouse_stock')
        .select(`
          *,
          products(*),
          warehouses(*)
        `)
        .order('updated_at', { ascending: false });

      if (targetWarehouseId) {
        query = query.eq('warehouse_id', targetWarehouseId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading inventory:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        set({ inventory: [], loading: false, error: error.message });
        return;
      }

      console.log('Datos recibidos de Supabase:', data?.length || 0, 'registros');

      // Procesar datos - Supabase devuelve los joins con el nombre de la tabla
      const inventoryItems: InventoryItem[] = (data || [])
        .filter((item: any) => {
          // Filtrar productos eliminados y validar que existan los datos
          const product = item.products;
          const warehouse = item.warehouses;
          const isValid = product && !product.deleted_at && warehouse;
          
          if (!isValid && product) {
            console.log('Item filtrado - producto eliminado o sin bodega:', {
              productId: product.id,
              productName: product.name,
              deletedAt: product.deleted_at,
              hasWarehouse: !!warehouse,
            });
          }
          
          return isValid;
        })
        .map((item: any) => ({
          id: item.id,
          product: item.products,
          warehouse: item.warehouses,
          quantity: item.quantity || 0,
          updated_at: item.updated_at,
        }));

      console.log(`Inventario procesado: ${inventoryItems.length} items válidos`);
      set({ inventory: inventoryItems, loading: false });
    } catch (error: any) {
      console.error('Error loading inventory (catch):', error);
      set({ inventory: [], loading: false, error: error.message || 'Error al cargar el inventario' });
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


