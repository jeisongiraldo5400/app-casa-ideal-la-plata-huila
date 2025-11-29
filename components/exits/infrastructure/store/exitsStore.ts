import { supabase } from "@/lib/supabase";
import { Database } from "@/types/database.types";
import { create } from "zustand";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type InventoryExit = Database["public"]["Tables"]["inventory_exits"]["Insert"];

export type ExitMode = 'direct_user' | 'direct_customer';

export interface ExitItem {
  product: Product;
  quantity: number;
  barcode: string;
  availableStock?: number;
  warehouseId?: string; // Para órdenes de entrega con múltiples bodegas
}

export interface DeliveryOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_barcode: string | null;
  product_sku: string | null;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  delivered_quantity: number;
  pending_quantity: number;
}

export interface DeliveryOrder {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_id_number: string;
  status: string;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  items: DeliveryOrderItem[];
}

interface ExitsState {
  // Sesión de salida
  warehouseId: string | null;
  exitItems: ExitItem[];
  exitMode: ExitMode | null;

  // Destinatarios
  selectedUserId: string | null;
  selectedCustomerId: string | null;
  selectedDeliveryOrderId: string | null;

  // Estado actual de escaneo
  currentProduct: Product | null;
  currentScannedBarcode: string | null;
  currentQuantity: number;
  currentAvailableStock: number;

  // Estado de UI
  loading: boolean;
  error: string | null;
  step: "setup" | "scanning";

  // Datos para formularios
  warehouses: Warehouse[];
  users: Profile[];
  customers: Customer[];
  customerSearchTerm: string;

  // Observaciones de la entrega (opcional)
  deliveryObservations: string;

  // Datos de orden de entrega
  deliveryOrders: DeliveryOrder[];
  selectedDeliveryOrder: DeliveryOrder | null;
  scannedItemsProgress: Map<string, number>; // product_id -> cantidad escaneada

  // Actions - Setup
  setWarehouse: (warehouseId: string | null) => void;
  setExitMode: (mode: ExitMode | null) => void;
  setSelectedUser: (userId: string | null) => void;
  setSelectedCustomer: (customerId: string | null) => void;
  setDeliveryObservations: (observations: string) => void;
  loadWarehouses: () => Promise<void>;
  loadUsers: () => Promise<void>;
  searchCustomers: (searchTerm: string) => Promise<void>;
  startExit: () => void;

  // Actions - Delivery Orders
  searchDeliveryOrdersByCustomer: (customerId: string) => Promise<void>;
  selectDeliveryOrder: (orderId: string) => Promise<void>;
  validateProductAgainstOrder: (productId: string, quantity: number) => {
    valid: boolean;
    error?: string;
  };

  // Actions - Scanning
  scanBarcode: (barcode: string) => Promise<void>;
  searchProductByBarcode: (barcode: string) => Promise<Product | null>;
  addProductToExit: (
    product: Product,
    quantity: number,
    barcode: string
  ) => Promise<void>;
  removeProductFromExit: (index: number) => void;
  updateProductQuantity: (index: number, quantity: number) => void;
  setQuantity: (quantity: number) => void;

  // Actions - Finalize
  finalizeExit: (userId: string) => Promise<{ error: any }>;

  // Actions - Reset
  reset: () => void;
  clearError: () => void;
  resetCurrentScan: () => void;
  goBackToSetup: () => void;
}

export const useExitsStore = create<ExitsState>((set, get) => ({
  // Initial state
  warehouseId: null,
  exitItems: [],
  exitMode: null,

  // Destinatarios
  selectedUserId: null,
  selectedCustomerId: null,
  selectedDeliveryOrderId: null,

  // Estado de escaneo
  currentProduct: null,
  currentScannedBarcode: null,
  currentQuantity: 1,
  currentAvailableStock: 0,

  // UI
  loading: false,
  error: null,
  step: "setup",

  // Datos
  warehouses: [],
  users: [],
  customers: [],
  customerSearchTerm: "",
  deliveryOrders: [],
  selectedDeliveryOrder: null,
  scannedItemsProgress: new Map(),
  deliveryObservations: "",

  // Setup actions
  setWarehouse: (warehouseId) => {
    set({ warehouseId });
  },

  setExitMode: (mode) => {
    set({
      exitMode: mode,
      // Reset related fields when mode changes
      selectedUserId: null,
      selectedCustomerId: null,
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      scannedItemsProgress: new Map(),
    });
  },

  setSelectedUser: (userId) => {
    set({ selectedUserId: userId });
  },

  setSelectedCustomer: (customerId) => {
    set({
      selectedCustomerId: customerId,
      // Reset delivery order when customer changes
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
    });
  },

  setDeliveryObservations: (observations) => {
    set({ deliveryObservations: observations });
  },

  loadWarehouses: async () => {
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error("Error loading warehouses:", error);
        set({ warehouses: [] });
        return;
      }
      set({ warehouses: data || [] });
    } catch (error: any) {
      console.error("Error loading warehouses:", error);
      set({ warehouses: [] });
    }
  },

  loadUsers: async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .is('deleted_at', null)
        .order('full_name');

      if (error) {
        console.error("Error loading users:", error);
        set({ users: [] });
        return;
      }
      set({ users: data as Profile[] || [] });
    } catch (error: any) {
      console.error("Error loading users:", error);
      set({ users: [] });
    }
  },

  searchCustomers: async (searchTerm: string) => {
    set({ customerSearchTerm: searchTerm, loading: true });

    try {
      // Buscar directamente en la tabla customers
      let query = supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      // Si hay término de búsqueda, filtrar por nombre o número de identificación
      if (searchTerm && searchTerm.trim()) {
        query = query.or(`name.ilike.%${searchTerm}%,id_number.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error("Error searching customers:", error);
        set({ customers: [], loading: false });
        return;
      }
      set({ customers: data || [], loading: false });
    } catch (error: any) {
      console.error("Error searching customers:", error);
      set({ customers: [], loading: false });
    }
  },

  searchDeliveryOrdersByCustomer: async (customerId: string) => {
    set({ loading: true });

    try {
      // Consulta directa a la tabla delivery_orders con agregación de items
      const { data, error } = await supabase
        .from('delivery_orders')
        .select(`
          *,
          items:delivery_order_items(
            id,
            product_id,
            warehouse_id,
            quantity,
            delivered_quantity
          )
        `)
        .eq('customer_id', customerId)
        .in('status', ['pending', 'preparing', 'ready'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error loading delivery orders:", error);
        set({ deliveryOrders: [], loading: false, error: error.message });
        return;
      }

      // Transformar los datos para incluir contadores
      const ordersWithCounts = (data || []).map((order: any) => ({
        ...order,
        total_items: order.items?.length || 0,
        total_quantity: order.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
        delivered_quantity: order.items?.reduce((sum: number, item: any) => sum + item.delivered_quantity, 0) || 0,
      }));

      set({ deliveryOrders: ordersWithCounts, loading: false });
    } catch (error: any) {
      console.error("Error loading delivery orders:", error);
      set({ deliveryOrders: [], loading: false, error: error.message });
    }
  },

  selectDeliveryOrder: async (orderId: string) => {
    set({ loading: true, error: null });

    try {
      // Consulta directa con joins para obtener todos los detalles
      const { data: orderData, error: orderError } = await supabase
        .from('delivery_orders')
        .select(`
          *,
          customer:customers(id, name, id_number),
          items:delivery_order_items(
            id,
            product_id,
            warehouse_id,
            quantity,
            delivered_quantity,
            product:products(id, name, barcode, sku),
            warehouse:warehouses(id, name)
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) {
        console.error("Error loading delivery order details:", orderError);
        set({
          selectedDeliveryOrder: null,
          selectedDeliveryOrderId: null,
          loading: false,
          error: orderError.message
        });
        return;
      }

      if (!orderData) {
        set({
          selectedDeliveryOrder: null,
          selectedDeliveryOrderId: null,
          loading: false,
          error: "Orden de entrega no encontrada"
        });
        return;
      }

      // Transformar los datos al formato esperado
      const deliveryOrder: DeliveryOrder = {
        id: orderData.id,
        customer_id: orderData.customer_id,
        customer_name: orderData.customer?.name || '',
        customer_id_number: orderData.customer?.id_number || '',
        status: orderData.status,
        delivery_address: orderData.delivery_address || '',
        notes: orderData.notes || '',
        created_at: orderData.created_at,
        items: (orderData.items || []).map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product?.name || '',
          product_barcode: item.product?.barcode || '',
          product_sku: item.product?.sku || null,
          warehouse_id: item.warehouse_id,
          warehouse_name: item.warehouse?.name || '',
          quantity: item.quantity,
          delivered_quantity: item.delivered_quantity,
          pending_quantity: item.quantity - item.delivered_quantity,
        })),
      };

      set({
        selectedDeliveryOrder: deliveryOrder,
        selectedDeliveryOrderId: orderId,
        scannedItemsProgress: new Map(),
        loading: false
      });
    } catch (error: any) {
      console.error("Error loading delivery order details:", error);
      set({
        selectedDeliveryOrder: null,
        selectedDeliveryOrderId: null,
        loading: false,
        error: error.message
      });
    }
  },

  validateProductAgainstOrder: (productId: string, quantity: number) => {
    const { selectedDeliveryOrder, scannedItemsProgress } = get();

    if (!selectedDeliveryOrder) {
      return { valid: false, error: "No hay orden de entrega seleccionada" };
    }

    // Buscar el producto en los items de la orden
    const orderItem = selectedDeliveryOrder.items.find(
      (item) => item.product_id === productId
    );

    if (!orderItem) {
      return {
        valid: false,
        error: "Este producto no está incluido en la orden de entrega"
      };
    }

    // Calcular cantidad ya escaneada
    const alreadyScanned = scannedItemsProgress.get(productId) || 0;
    const totalScanned = alreadyScanned + quantity;
    const pendingQuantity = orderItem.pending_quantity;

    if (totalScanned > pendingQuantity) {
      return {
        valid: false,
        error: `La cantidad excede lo pendiente. Pendiente: ${pendingQuantity}, Ya escaneado: ${alreadyScanned}`
      };
    }

    return { valid: true };
  },

  startExit: () => {
    const { warehouseId, exitMode, selectedUserId, selectedCustomerId, selectedDeliveryOrderId } = get();

    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
      return;
    }

    if (!exitMode) {
      set({ error: "Debe seleccionar un modo de salida" });
      return;
    }

    // Validar según el modo
    if (exitMode === 'direct_user' && !selectedUserId) {
      set({ error: "Debe seleccionar un usuario destinatario" });
      return;
    }

    if (exitMode === 'direct_customer' && !selectedCustomerId) {
      set({ error: "Debe seleccionar un cliente destinatario" });
      return;
    }

    set({ step: "scanning", error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string) => {
    set({ loading: true, error: null, currentScannedBarcode: barcode });

    try {
      const product = await get().searchProductByBarcode(barcode);

      if (!product) {
        set({
          loading: false,
          error: "Producto no encontrado. Este código de barras no está registrado en el sistema.",
          currentProduct: null,
          currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
        });
        return;
      }

      const { warehouseId, exitMode, selectedDeliveryOrderId, selectedDeliveryOrder } = get();
      if (!warehouseId) {
        set({
          loading: false,
          error: "Debe seleccionar una bodega primero",
          currentProduct: null,
          currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
        });
        return;
      }

      // Si hay una orden de entrega seleccionada, validar contra ella
      if (selectedDeliveryOrderId && selectedDeliveryOrder) {
        const validation = get().validateProductAgainstOrder(
          product.id,
          1 // Validar con cantidad 1 inicialmente
        );

        if (!validation.valid) {
          set({
            loading: false,
            error: validation.error || "Producto no válido para esta orden",
            currentProduct: null,
            currentScannedBarcode: null,
          });
          return;
        }
      }

      // Verificar stock disponible en la bodega seleccionada
      const { data: stock, error: stockError } = await supabase
        .from("warehouse_stock")
        .select("quantity")
        .eq("product_id", product.id)
        .eq("warehouse_id", warehouseId)
        .single();

      const availableStock = stock?.quantity || 0;

      if (availableStock <= 0) {
        set({
          loading: false,
          error: `No hay stock disponible de este producto en la bodega seleccionada. Stock actual: ${availableStock}`,
          currentProduct: null,
          currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
        });
        return;
      }

      set({
        loading: false,
        currentProduct: product,
        currentQuantity: 1,
        currentAvailableStock: availableStock,
        error: null,
      });
    } catch (error: any) {
      console.error("Error scanning barcode:", error);
      set({
        loading: false,
        error: error.message || "Error al escanear el código de barras",
        currentProduct: null,
        currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
      });
    }
  },

  searchProductByBarcode: async (barcode: string): Promise<Product | null> => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("barcode", barcode)
        .is("deleted_at", null)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        throw error;
      }

      return data as Product;
    } catch (error: any) {
      console.error("Error searching product:", error);
      return null;
    }
  },

  addProductToExit: async (product: Product, quantity: number, barcode: string) => {
    const { exitItems, warehouseId, currentProduct, currentAvailableStock, exitMode, scannedItemsProgress, selectedDeliveryOrderId } = get();

    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
      return;
    }

    if (quantity <= 0) {
      set({ error: "La cantidad debe ser mayor a 0" });
      return;
    }

    // Si hay una orden de entrega seleccionada, validar contra la orden (opcional para direct_customer)
    if (selectedDeliveryOrderId) {
      const validation = get().validateProductAgainstOrder(product.id, quantity);
      if (!validation.valid) {
        set({ error: validation.error });
        return;
      }
    }

    // OPTIMIZADO: Reutilizar stock cacheado si es el mismo producto recién escaneado
    let availableStock: number = 0;

    if (currentProduct?.id === product.id && currentAvailableStock !== undefined) {
      availableStock = currentAvailableStock;
    } else {
      const { data: stock } = await supabase
        .from("warehouse_stock")
        .select("quantity")
        .eq("product_id", product.id)
        .eq("warehouse_id", warehouseId)
        .single();

      availableStock = stock?.quantity || 0;
    }

    // Calcular cantidad total ya agregada en esta salida
    const existingItem = exitItems.find((item) => item.product.id === product.id);
    const totalQuantityInExit = (existingItem?.quantity || 0) + quantity;

    if (totalQuantityInExit > availableStock) {
      set({
        error: `No hay suficiente stock. Disponible: ${availableStock}, Intentando sacar: ${totalQuantityInExit}`,
      });
      return;
    }

    // Si hay una orden de entrega seleccionada, actualizar progreso
    if (selectedDeliveryOrderId) {
      const currentProgress = scannedItemsProgress.get(product.id) || 0;
      const newProgress = new Map(scannedItemsProgress);
      newProgress.set(product.id, currentProgress + quantity);
      set({ scannedItemsProgress: newProgress });
    }

    // Si el producto ya está en la lista, actualizar cantidad
    if (existingItem) {
      const updatedItems = exitItems.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + quantity, availableStock }
          : item
      );
      set({ exitItems: updatedItems, error: null });
    } else {
      // Agregar nuevo producto
      set({
        exitItems: [
          ...exitItems,
          { product, quantity, barcode, availableStock },
        ],
        error: null,
      });
    }

    // Resetear escaneo actual
    get().resetCurrentScan();
  },

  removeProductFromExit: (index: number) => {
    const { exitItems } = get();
    const updatedItems = exitItems.filter((_, i) => i !== index);
    set({ exitItems: updatedItems });
  },

  updateProductQuantity: (index: number, quantity: number) => {
    const { exitItems, warehouseId } = get();

    if (!warehouseId || quantity <= 0) {
      return;
    }

    const item = exitItems[index];
    if (!item) return;

    // Verificar que no exceda el stock disponible
    if (quantity > (item.availableStock || 0)) {
      set({
        error: `La cantidad no puede exceder el stock disponible: ${item.availableStock || 0}`,
      });
      return;
    }

    const updatedItems = exitItems.map((item, i) =>
      i === index ? { ...item, quantity } : item
    );
    set({ exitItems: updatedItems, error: null });
  },


  setQuantity: (quantity: number) => {
    set({ currentQuantity: quantity });
  },

  // Finalize exit
  finalizeExit: async (userId: string): Promise<{ error: any }> => {
    const {
      exitItems,
      warehouseId,
      exitMode,
      selectedUserId,
      selectedCustomerId,
      selectedDeliveryOrderId,
      selectedDeliveryOrder,
      deliveryObservations,
    } = get();

    if (exitItems.length === 0) {
      return { error: { message: "No hay productos para registrar" } };
    }

    if (!warehouseId) {
      return { error: { message: "Debe seleccionar una bodega" } };
    }

    if (!exitMode) {
      return { error: { message: "Debe seleccionar un modo de salida" } };
    }

    try {
      // Preparar datos según el modo de salida
      const exits: InventoryExit[] = exitItems.map((item) => {
        const baseExit: InventoryExit = {
          product_id: item.product.id,
          quantity: item.quantity,
          warehouse_id: warehouseId,
          barcode_scanned: item.barcode,
          created_by: userId,
        };

        // Agregar destinatario según el modo
        if (exitMode === 'direct_user') {
          baseExit.delivered_to_user_id = selectedUserId;
        } else if (exitMode === 'direct_customer') {
          baseExit.delivered_to_customer_id = selectedCustomerId;
          // Si hay una orden de entrega seleccionada, agregarla (opcional)
          if (selectedDeliveryOrderId) {
            baseExit.delivery_order_id = selectedDeliveryOrderId;
          }
        }

        // Observaciones de entrega opcionales (campo agregado en el schema)
        if (deliveryObservations && deliveryObservations.trim()) {
          (baseExit as any).delivery_observations = deliveryObservations.trim();
        }

        return baseExit;
      });

      // Insertar salidas
      const { error: exitsError } = await supabase
        .from("inventory_exits")
        .insert(exits);

      if (exitsError) {
        return { error: exitsError };
      }

      // Si hay una orden de entrega seleccionada, actualizar el progreso de la orden
      if (selectedDeliveryOrderId && selectedDeliveryOrder) {
        for (const item of exitItems) {
          const { data, error: updateError } = await supabase.rpc(
            'update_delivery_order_progress',
            {
              order_id_param: selectedDeliveryOrderId,
              product_id_param: item.product.id,
              quantity_delivered_param: item.quantity,
            }
          );

          if (updateError) {
            console.error("Error updating delivery order progress:", updateError);
          }

          if (data && data.all_delivered) {
            console.log("Orden de entrega completada:", selectedDeliveryOrderId);
          }
        }
      }

      // Resetear todo después de finalizar
      get().reset();

      return { error: null };
    } catch (error: any) {
      console.error("Error finalizing exit:", error);
      return { error };
    }
  },

  // Reset actions
  reset: () => {
    set({
      warehouseId: null,
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      step: "setup",
      error: null,
      exitMode: null,
      selectedUserId: null,
      selectedCustomerId: null,
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      scannedItemsProgress: new Map(),
      customerSearchTerm: "",
      deliveryObservations: "",
    });
  },

  clearError: () => {
    set({ error: null });
  },

  resetCurrentScan: () => {
    set({
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
    });
  },

  goBackToSetup: () => {
    set({
      step: "setup",
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      error: null,
    });
  },
}));

