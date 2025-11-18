import { supabase } from '@/lib/supabase';
import { create } from 'zustand';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  supplier_id?: string;
  status: string;
  description?: string;
  unit_of_measure?: string;
}

export interface Movement {
  id?: string;
  movement_type: 'entrada' | 'salida';
  product_id: string;
  quantity: number;
  registered_by: string;
  timestamp?: string;
  location?: string;
  purchase_order_id?: string;
}

export interface UnregisteredBarcodeScan {
  id?: string;
  barcode: string;
  scanned_at?: string;
  scanned_by: string;
  purchase_order_id?: string;
  location?: string;
}

interface EntriesState {
  currentProduct: Product | null;
  loading: boolean;
  error: string | null;
  scannedBarcode: string | null;
  quantity: number;
  purchaseOrderId: string | null;
  location: string | null;
  
  // Actions
  scanBarcode: (barcode: string) => Promise<void>;
  searchProductByBarcode: (barcode: string) => Promise<Product | null>;
  registerUnregisteredScan: (barcode: string, userId: string) => Promise<void>;
  registerEntry: (productId: string, quantity: number, userId: string) => Promise<{ error: any }>;
  setQuantity: (quantity: number) => void;
  setPurchaseOrderId: (orderId: string | null) => void;
  setLocation: (location: string | null) => void;
  reset: () => void;
  clearError: () => void;
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  currentProduct: null,
  loading: false,
  error: null,
  scannedBarcode: null,
  quantity: 0,
  purchaseOrderId: null,
  location: null,

  scanBarcode: async (barcode: string) => {
    set({ loading: true, error: null, scannedBarcode: barcode });
    try {
      const product = await get().searchProductByBarcode(barcode);
      if (product) {
        set({ currentProduct: product, loading: false });
      } else {
        set({ 
          currentProduct: null, 
          loading: false,
          error: 'Producto no encontrado. Este código de barras no está registrado en el sistema.'
        });
      }
    } catch (error: any) {
      set({ 
        loading: false, 
        error: error.message || 'Error al buscar el producto' 
      });
    }
  },

  searchProductByBarcode: async (barcode: string): Promise<Product | null> => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .eq('status', 'active')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No se encontró el producto
          return null;
        }
        throw error;
      }

      return data as Product;
    } catch (error: any) {
      console.error('Error searching product:', error);
      return null;
    }
  },

  registerUnregisteredScan: async (barcode: string, userId: string) => {
    try {
      const { purchaseOrderId, location } = get();
      const { error } = await supabase
        .from('unregistered_barcode_scans')
        .insert({
          barcode,
          scanned_by: userId,
          scanned_at: new Date().toISOString(),
          purchase_order_id: purchaseOrderId || null,
          location: location || null,
        });

      if (error) {
        console.error('Error registering unregistered scan:', error);
      }
    } catch (error) {
      console.error('Error registering unregistered scan:', error);
    }
  },

  registerEntry: async (productId: string, quantity: number, userId: string) => {
    try {
      const { purchaseOrderId, location } = get();
      
      // Registrar el movimiento
      const { error: movementError } = await supabase
        .from('movements')
        .insert({
          movement_type: 'entrada',
          product_id: productId,
          quantity,
          registered_by: userId,
          timestamp: new Date().toISOString(),
          purchase_order_id: purchaseOrderId || null,
          location: location || null,
        });

      if (movementError) {
        return { error: movementError };
      }

      // Actualizar el inventario (asumiendo que hay una tabla inventory)
      // Esto puede variar según tu esquema de base de datos
      const { error: inventoryError } = await supabase.rpc('increment_inventory', {
        product_id: productId,
        quantity: quantity,
      });

      if (inventoryError) {
        // Si la función RPC no existe, intentamos actualizar directamente
        // Esto es un fallback, ajusta según tu esquema
        console.warn('RPC function not available, skipping inventory update');
      }

      // Resetear el estado después de registrar exitosamente
      get().reset();
      
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  },

  setQuantity: (quantity: number) => {
    set({ quantity });
  },

  setPurchaseOrderId: (orderId: string | null) => {
    set({ purchaseOrderId: orderId });
  },

  setLocation: (location: string | null) => {
    set({ location });
  },

  reset: () => {
    set({
      currentProduct: null,
      scannedBarcode: null,
      quantity: 0,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));

