import { supabase } from '@/lib/supabase';
import { create } from 'zustand';
// eslint-disable-next-line import/namespace
import { Database } from '@/types/database.types';
import { Alert } from 'react-native';

type Product = Database['public']['Tables']['products']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];

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

      // Procesar datos - Supabase devuelve los joins con el nombre de la tabla
      const inventoryItems: InventoryItem[] = (data || [])
        .filter((item: any) => {
          // Filtrar productos eliminados y validar que existan los datos
          const product = item.products;
          const warehouse = item.warehouses;
          const isValid = product && !product.deleted_at && warehouse;
          
          if (!isValid && product) {
            const message = product.deleted_at 
              ? `El producto "${product.name || product.barcode || 'sin nombre'}" ha sido eliminado y no puede mostrarse en el inventario.`
              : `El producto "${product.name || product.barcode || 'sin nombre'}" no tiene una bodega asociada válida.`;
            
            Alert.alert(
              'Producto inválido',
              message,
              [{ text: 'OK' }]
            );
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

      set({ inventory: inventoryItems, loading: false });
    } catch (error: any) {
      console.error('Error loading inventory (catch):', error);
      set({ inventory: [], loading: false, error: error.message || 'Error al cargar el inventario' });
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


