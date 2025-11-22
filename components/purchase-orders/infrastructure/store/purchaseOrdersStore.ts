import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { create } from 'zustand';

type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row'];
type PurchaseOrderUpdate = Database['public']['Tables']['purchase_orders']['Update'];

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  purchase_order_id: string;
  quantity: number;
  created_at: string | null;
  product?: {
    id: string;
    name: string;
    barcode: string;
  };
}

interface PurchaseOrderWithSupplier extends PurchaseOrder {
  supplier?: {
    id: string;
    name: string | null;
    nit: string | null;
  };
  created_by_profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
  items?: PurchaseOrderItem[];
}

interface PurchaseOrdersState {
  purchaseOrders: PurchaseOrderWithSupplier[];
  loading: boolean;
  error: string | null;
  loadPurchaseOrders: (status?: 'pending' | 'approved' | 'received') => Promise<void>;
  updatePurchaseOrderStatus: (
    orderId: string,
    status: 'pending' | 'approved' | 'received'
  ) => Promise<{ success: boolean; error: string | null }>;
  validateOrderIsComplete: (orderId: string) => Promise<{
    isComplete: boolean;
    error: string | null;
    details?: {
      totalItemsQuantity: number;
      totalQuantityRegistered: number;
      missingItems: Array<{
        product_id: string;
        expected: number;
        registered: number;
        missing: number;
      }>;
    };
  }>;
  markOrderAsReceived: (orderId: string) => Promise<{ success: boolean; error: string | null }>;
  clearError: () => void;
}

export const usePurchaseOrdersStore = create<PurchaseOrdersState>((set, get) => ({
  purchaseOrders: [],
  loading: false,
  error: null,

  loadPurchaseOrders: async (status?: 'pending' | 'approved' | 'received') => {
    set({ loading: true, error: null });
    try {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers:supplier_id (
            id,
            name,
            nit
          ),
          profiles:created_by (
            id,
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading purchase orders:', error);
        set({ error: error.message, loading: false });
        return;
      }

      // Para cada orden, cargar sus items con los productos
      const ordersWithItems: PurchaseOrderWithSupplier[] = await Promise.all(
        (data || []).map(async (order: any) => {
          // Cargar items de la orden
          const { data: items, error: itemsError } = await supabase
            .from('purchase_order_items')
            .select(`
              *,
              products:product_id (
                id,
                name,
                barcode
              )
            `)
            .eq('purchase_order_id', order.id);

          const orderItems: PurchaseOrderItem[] = items
            ? items.map((item: any) => ({
                ...item,
                product: Array.isArray(item.products) ? item.products[0] : item.products,
              }))
            : [];

          return {
            ...order,
            supplier: Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers,
            created_by_profile: Array.isArray(order.profiles) ? order.profiles[0] : order.profiles,
            items: orderItems,
          };
        })
      );

      set({ purchaseOrders: ordersWithItems, loading: false });
    } catch (error: any) {
      console.error('Error loading purchase orders:', error);
      set({ error: error.message || 'Error al cargar las órdenes de compra', loading: false });
    }
  },

  updatePurchaseOrderStatus: async (
    orderId: string,
    status: 'pending' | 'approved' | 'received'
  ) => {
    set({ loading: true, error: null });
    try {
      const updateData: PurchaseOrderUpdate = {
        status,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) {
        console.error('Error updating purchase order status:', error);
        set({ loading: false });
        return { success: false, error: error.message };
      }

      // Actualizar el estado local
      const currentOrders = get().purchaseOrders;
      const updatedOrders = currentOrders.map((order) =>
        order.id === orderId ? { ...order, status, updated_at: updateData.updated_at } : order
      );

      set({ purchaseOrders: updatedOrders, loading: false });
      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error updating purchase order status:', error);
      set({ loading: false });
      return { success: false, error: error.message || 'Error al actualizar el estado' };
    }
  },

  /**
   * Valida si una orden de compra está completa (todas las unidades registradas)
   */
  validateOrderIsComplete: async (orderId: string): Promise<{
    isComplete: boolean;
    error: string | null;
    details?: {
      totalItemsQuantity: number;
      totalQuantityRegistered: number;
      missingItems: Array<{
        product_id: string;
        expected: number;
        registered: number;
        missing: number;
      }>;
    };
  }> => {
    try {
      // Cargar los items de la orden
      const { data: orderItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('product_id, quantity')
        .eq('purchase_order_id', orderId);

      if (itemsError) {
        return {
          isComplete: false,
          error: `Error al cargar los items de la orden: ${itemsError.message}`,
        };
      }

      if (!orderItems || orderItems.length === 0) {
        return {
          isComplete: false,
          error: 'La orden de compra no tiene items',
        };
      }

      // Cargar las entradas de inventario para esta orden
      const { data: inventoryEntries, error: entriesError } = await supabase
        .from('inventory_entries')
        .select('product_id, quantity')
        .eq('purchase_order_id', orderId);

      if (entriesError) {
        return {
          isComplete: false,
          error: `Error al cargar las entradas de inventario: ${entriesError.message}`,
        };
      }

      // Calcular cantidades por producto
      const expectedByProduct: Record<string, number> = {};
      orderItems.forEach((item) => {
        expectedByProduct[item.product_id] =
          (expectedByProduct[item.product_id] || 0) + item.quantity;
      });

      const registeredByProduct: Record<string, number> = {};
      (inventoryEntries || []).forEach((entry) => {
        registeredByProduct[entry.product_id] =
          (registeredByProduct[entry.product_id] || 0) + entry.quantity;
      });

      // Verificar que todos los productos tengan las cantidades completas
      const missingItems: Array<{
        product_id: string;
        expected: number;
        registered: number;
        missing: number;
      }> = [];

      let isComplete = true;
      const totalItemsQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalQuantityRegistered = (inventoryEntries || []).reduce(
        (sum, entry) => sum + entry.quantity,
        0
      );

      for (const productId in expectedByProduct) {
        const expected = expectedByProduct[productId];
        const registered = registeredByProduct[productId] || 0;
        const missing = expected - registered;

        if (missing > 0) {
          isComplete = false;
          missingItems.push({
            product_id: productId,
            expected,
            registered,
            missing,
          });
        }
      }

      return {
        isComplete,
        error: isComplete
          ? null
          : `La orden no está completa. Faltan unidades por registrar.`,
        details: {
          totalItemsQuantity,
          totalQuantityRegistered,
          missingItems,
        },
      };
    } catch (error: any) {
      return {
        isComplete: false,
        error: error.message || 'Error al validar la orden',
      };
    }
  },

  markOrderAsReceived: async (orderId: string) => {
    // Primero validar que la orden esté completa
    const validation = await get().validateOrderIsComplete(orderId);

    if (!validation.isComplete) {
      return {
        success: false,
        error:
          validation.error ||
          'No se puede marcar la orden como recibida porque no está completa. Todas las unidades deben estar registradas.',
      };
    }

    // Si está completa, actualizar el estado
    return get().updatePurchaseOrderStatus(orderId, 'received');
  },

  clearError: () => {
    set({ error: null });
  },
}));

