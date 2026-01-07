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
  order_number: string | null;
  customer_id: string;
  customer_name: string;
  customer_id_number: string;
  status: string;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  items: DeliveryOrderItem[];
}

export interface SelectedDeliveryOrderProgressItem {
  item: DeliveryOrderItem;
  orderQuantity: number;
  registered: number; // Ya entregado (desde BD)
  sessionScanned: number; // Escaneado en esta sesión
  pending: number;
  isComplete: boolean;
}

export interface SelectedDeliveryOrderProgress {
  items: SelectedDeliveryOrderProgressItem[];
  totalRequired: number;
  totalRegistered: number;
  totalScanned: number;
  totalCompleted: number;
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
  loadingMessage: string | null;
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

  // Cache de salidas registradas por orden y producto (para evitar consultas redundantes)
  registeredExitsCache: Record<string, Record<string, number>>; // orderId -> productId -> quantity

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
  searchDeliveryOrdersByUser: (userId: string) => Promise<void>;
  selectDeliveryOrder: (orderId: string) => Promise<void>;
  validateProductAgainstOrder: (productId: string, quantity: number) => {
    valid: boolean;
    error?: string;
  };
  getSelectedDeliveryOrderProgress: () => SelectedDeliveryOrderProgress | null;

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
  loadingMessage: null,
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
  registeredExitsCache: {},
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
      registeredExitsCache: {},
    });
  },

  setSelectedUser: (userId) => {
    set({
      selectedUserId: userId,
      // Reset delivery order when user changes
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
    });
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
    set({ customerSearchTerm: searchTerm, loading: true, loadingMessage: 'Buscando clientes...' });

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
        set({ customers: [], loading: false, loadingMessage: null });
        return;
      }
      set({ customers: data || [], loading: false, loadingMessage: null });
    } catch (error: any) {
      console.error("Error searching customers:", error);
      set({ customers: [], loading: false, loadingMessage: null });
    }
  },

  searchDeliveryOrdersByCustomer: async (customerId: string) => {
    set({ loading: true, loadingMessage: 'Cargando órdenes de entrega...' });

    try {
      // Consulta directa a la tabla delivery_orders con agregación de items
      const { data, error } = await supabase
        .from('delivery_orders')
        .select(`
          *,
          items:delivery_order_items!fk_delivery_order_item_order(
            id,
            product_id,
            warehouse_id,
            quantity
          )
        `)
        .eq('customer_id', customerId)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error loading delivery orders:", error);
        set({ deliveryOrders: [], loading: false, loadingMessage: null, error: error.message });
        return;
      }

      if (!data || data.length === 0) {
        set({ deliveryOrders: [], loading: false, loadingMessage: null });
        return;
      }

      // Obtener todas las salidas de inventario para estas órdenes desde inventory_exits
      const orderIds = data.map((order: any) => order.id);

      // Primero obtener los IDs de salidas canceladas para excluirlas
      const { data: cancelledExits, error: cancelledError } = await supabase
        .from("inventory_exit_cancellations")
        .select("inventory_exit_id");

      const cancelledExitIds = new Set(
        (cancelledExits || []).map((c: any) => c.inventory_exit_id)
      );

      // Obtener todas las salidas y filtrar las canceladas
      const { data: exitsData, error: exitsError } = await supabase
        .from("inventory_exits")
        .select("id, delivery_order_id, product_id, quantity")
        .in("delivery_order_id", orderIds);

      if (exitsError) {
        console.error("Error loading inventory exits for delivery orders:", exitsError);
      }

      // Agrupar salidas por order_id y product_id (excluyendo canceladas)
      const exitsByOrder = new Map<string, Map<string, number>>();
      (exitsData || []).forEach((exit: any) => {
        // Excluir salidas canceladas
        if (cancelledExitIds.has(exit.id)) return;
        if (!exit.delivery_order_id || !exit.product_id) return;
        if (!exitsByOrder.has(exit.delivery_order_id)) {
          exitsByOrder.set(exit.delivery_order_id, new Map());
        }
        const productMap = exitsByOrder.get(exit.delivery_order_id)!;
        productMap.set(
          exit.product_id,
          (productMap.get(exit.product_id) || 0) + (exit.quantity || 0)
        );
      });

      // Transformar los datos para incluir contadores desde inventory_exits
      const ordersWithCounts = data.map((order: any) => {
        const orderExits = exitsByOrder.get(order.id) || new Map();
        let totalDelivered = 0;
        const totalQuantity = order.items?.reduce((sum: number, item: any) => {
          const rawDelivered = orderExits.get(item.product_id) || 0;
          const clampedDelivered = Math.min(rawDelivered, item.quantity);
          totalDelivered += clampedDelivered;
          return sum + item.quantity;
        }, 0) || 0;

        return {
          ...order,
          total_items: order.items?.length || 0,
          total_quantity: totalQuantity,
          delivered_quantity: totalDelivered,
        };
      });

      // Filtrar solo las órdenes que NO están completadas (delivered_quantity < total_quantity)
      // Esto evita sobrecargar el sistema mostrando órdenes que ya no necesitan procesamiento
      const incompleteOrders = ordersWithCounts.filter((order: any) =>
        order.total_quantity > 0 && order.delivered_quantity < order.total_quantity
      );

      set({ deliveryOrders: incompleteOrders, loading: false, loadingMessage: null });
    } catch (error: any) {
      console.error("Error loading delivery orders:", error);
      set({ deliveryOrders: [], loading: false, loadingMessage: null, error: error.message });
    }
  },

  searchDeliveryOrdersByUser: async (userId: string) => {
    set({ loading: true, loadingMessage: 'Cargando órdenes...' });

    try {
      // Usar RPC que expande remisiones en órdenes independientes
      const { data, error } = await supabase
        .rpc('get_user_delivery_orders_expanded', {
          p_user_id: userId
        });

      if (error) {
        console.error("Error loading orders:", error);
        set({ deliveryOrders: [], loading: false, loadingMessage: null, error: error.message });
        return;
      }

      const orders = data || [];

      if (orders.length === 0) {
        set({ deliveryOrders: [], loading: false, loadingMessage: null });
        return;
      }

      // Obtener todas las salidas de inventario para estas órdenes desde inventory_exits
      const orderIds = orders.map((order: any) => order.id);

      // Primero obtener los IDs de salidas canceladas para excluirlas
      const { data: cancelledExits, error: cancelledError } = await supabase
        .from("inventory_exit_cancellations")
        .select("inventory_exit_id");

      const cancelledExitIds = new Set(
        (cancelledExits || []).map((c: any) => c.inventory_exit_id)
      );

      // Obtener todas las salidas y filtrar las canceladas
      const { data: exitsData, error: exitsError } = await supabase
        .from("inventory_exits")
        .select("id, delivery_order_id, product_id, quantity")
        .in("delivery_order_id", orderIds);

      if (exitsError) {
        console.error("Error loading inventory exits for orders:", exitsError);
      }

      // Agrupar salidas por order_id y product_id (excluyendo canceladas)
      const exitsByOrder = new Map<string, Map<string, number>>();
      (exitsData || []).forEach((exit: any) => {
        // Excluir salidas canceladas
        if (cancelledExitIds.has(exit.id)) return;
        if (!exit.delivery_order_id || !exit.product_id) return;
        if (!exitsByOrder.has(exit.delivery_order_id)) {
          exitsByOrder.set(exit.delivery_order_id, new Map());
        }
        const productMap = exitsByOrder.get(exit.delivery_order_id)!;
        productMap.set(
          exit.product_id,
          (productMap.get(exit.product_id) || 0) + (exit.quantity || 0)
        );
      });

      // Calcular delivered_quantity para cada orden
      const ordersWithProgress = orders.map((order: any) => {
        const orderExits = exitsByOrder.get(order.id) || new Map();

        // El RPC ya retorna total_quantity, solo necesitamos calcular delivered
        let totalDelivered = 0;

        // Sumar todas las salidas registradas para esta orden
        orderExits.forEach((quantity) => {
          totalDelivered += quantity;
        });

        // Limitar delivered_quantity al total_quantity
        const clampedDelivered = Math.min(totalDelivered, order.total_quantity || 0);

        return {
          ...order,
          delivered_quantity: clampedDelivered,
        };
      });

      // Filtrar solo las órdenes que NO están completadas (delivered_quantity < total_quantity)
      const incompleteOrders = ordersWithProgress.filter((order: any) =>
        order.total_quantity > 0 && order.delivered_quantity < order.total_quantity
      );

      set({ deliveryOrders: incompleteOrders, loading: false, loadingMessage: null });
    } catch (error: any) {
      console.error("Error loading orders:", error);
      set({ deliveryOrders: [], loading: false, loadingMessage: null, error: error.message });
    }
  },

  selectDeliveryOrder: async (orderId: string) => {
    set({ loading: true, loadingMessage: 'Cargando detalles de la orden...', error: null });

    try {
      // Consulta directa con joins para obtener todos los detalles
      const { data: orderData, error: orderError } = await supabase
        .from('delivery_orders')
        .select(`
          *,
          customer:customers(id, name, id_number),
          assigned_to_user:profiles(id, full_name, email),
          items:delivery_order_items!fk_delivery_order_item_order(
            id,
            product_id,
            warehouse_id,
            quantity,
            source_delivery_order_id,
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
          loadingMessage: null,
          error: orderError.message
        });
        return;
      }

      if (!orderData) {
        set({
          selectedDeliveryOrder: null,
          selectedDeliveryOrderId: null,
          loading: false,
          loadingMessage: null,
          error: "Orden de entrega no encontrada"
        });
        return;
      }

      // Obtener las salidas de inventario para esta orden desde inventory_exits
      // Primero obtener los IDs de salidas canceladas para excluirlas
      const { data: cancelledExits, error: cancelledError } = await supabase
        .from("inventory_exit_cancellations")
        .select("inventory_exit_id");

      const cancelledExitIds = new Set(
        (cancelledExits || []).map((c: any) => c.inventory_exit_id)
      );

      // Obtener todas las salidas y filtrar las canceladas
      const { data: exitsData, error: exitsError } = await supabase
        .from("inventory_exits")
        .select("id, product_id, quantity")
        .eq("delivery_order_id", orderId);

      if (exitsError) {
        console.error("Error loading inventory exits for delivery order:", exitsError);
        // Continuar aunque haya error, pero con cache vacío
      }

      // Calcular cantidades registradas por producto desde inventory_exits (excluyendo canceladas)
      const registeredByProduct: Record<string, number> = {};
      (exitsData || []).forEach((exit: any) => {
        // Excluir salidas canceladas
        if (cancelledExitIds.has(exit.id)) return;
        if (!exit.product_id) return;
        registeredByProduct[exit.product_id] =
          (registeredByProduct[exit.product_id] || 0) + (exit.quantity || 0);
      });

      // Transformar los datos al formato esperado
      // Para remisiones (assigned_to_user_id), usar el nombre del usuario asignado
      // Para clientes (customer_id), usar el nombre del cliente
      const customerName = orderData.customer?.name || orderData.assigned_to_user?.full_name || '';
      const customerIdNumber = orderData.customer?.id_number || '';

      // Incluir TODOS los items (directos + de órdenes asignadas)
      const allItems = orderData.items || [];

      const deliveryOrder: DeliveryOrder = {
        id: orderData.id,
        order_number: orderData.order_number || null,
        customer_id: orderData.customer_id || '',
        customer_name: customerName,
        customer_id_number: customerIdNumber,
        status: orderData.status,
        delivery_address: orderData.delivery_address || '',
        notes: orderData.notes || '',
        created_at: orderData.created_at,
        items: allItems.map((item: any) => {
          const rawRegistered = registeredByProduct[item.product_id] || 0;
          const clampedRegistered = Math.min(rawRegistered, item.quantity);
          return {
            id: item.id,
            product_id: item.product_id,
            product_name: item.product?.name || '',
            product_barcode: item.product?.barcode || '',
            product_sku: item.product?.sku || null,
            warehouse_id: item.warehouse_id,
            warehouse_name: item.warehouse?.name || '',
            quantity: item.quantity,
            delivered_quantity: clampedRegistered,
            pending_quantity: item.quantity - clampedRegistered,
          };
        }),
      };

      // Actualizar el cache de salidas registradas desde inventory_exits
      const { registeredExitsCache } = get();
      const updatedCache = { ...registeredExitsCache };

      // Inicializar o REEMPLAZAR el objeto para esta orden
      updatedCache[orderId] = {};

      // Agrupar por product_id usando las cantidades de inventory_exits (truncadas)
      deliveryOrder.items.forEach((item) => {
        const rawRegistered = registeredByProduct[item.product_id] || 0;
        const clampedRegistered = Math.min(rawRegistered, item.quantity);

        // Solo agregar al cache si tiene cantidad registrada > 0
        if (clampedRegistered > 0) {
          updatedCache[orderId][item.product_id] = clampedRegistered;
        }
        console.log(`[selectDeliveryOrder] Product ${item.product_id}: registered=${clampedRegistered} from inventory_exits (raw=${rawRegistered}, max=${item.quantity})`);
      });

      set({
        selectedDeliveryOrder: deliveryOrder,
        selectedDeliveryOrderId: orderId,
        scannedItemsProgress: new Map(),
        registeredExitsCache: updatedCache,
        loading: false,
        loadingMessage: null
      });
    } catch (error: any) {
      console.error("Error loading delivery order details:", error);
      set({
        selectedDeliveryOrder: null,
        selectedDeliveryOrderId: null,
        loading: false,
        loadingMessage: null,
        error: error.message
      });
    }
  },

  validateProductAgainstOrder: (productId: string, quantity: number) => {
    const {
      selectedDeliveryOrder,
      selectedDeliveryOrderId,
      registeredExitsCache,
      scannedItemsProgress,
      exitItems,
    } = get();

    if (!selectedDeliveryOrder || !selectedDeliveryOrderId) {
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

    // Cantidad ya entregada en BD
    const registeredInBD =
      registeredExitsCache[selectedDeliveryOrderId]?.[productId] || 0;

    // Cantidad ya agregada en esta sesión (en el carrito)
    const sessionTotal = exitItems
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

    const newTotal = registeredInBD + sessionTotal + quantity;
    const orderQuantity = orderItem.quantity;

    if (newTotal > orderQuantity) {
      const maxAllowable = Math.max(
        orderQuantity - registeredInBD - sessionTotal,
        0
      );
      return {
        valid: false,
        error: `La cantidad excede lo requerido. Requerido: ${orderQuantity}, Ya entregado: ${registeredInBD}, En esta sesión: ${sessionTotal}, Máximo permitido: ${maxAllowable}`,
      };
    }

    return { valid: true };
  },

  getSelectedDeliveryOrderProgress:
    (): SelectedDeliveryOrderProgress | null => {
      const {
        selectedDeliveryOrder,
        selectedDeliveryOrderId,
        registeredExitsCache,
        scannedItemsProgress,
      } = get();

      if (!selectedDeliveryOrder || !selectedDeliveryOrderId) {
        return null;
      }

      let items = selectedDeliveryOrder.items || [];

      const normalizedItems: SelectedDeliveryOrderProgressItem[] = items.map(
        (item) => {
          const orderQuantity = item.quantity;
          const rawRegistered =
            registeredExitsCache[selectedDeliveryOrderId]?.[item.product_id] || 0;
          const registered = Math.min(rawRegistered, orderQuantity);
          const maxPendingAfterRegistered = Math.max(
            orderQuantity - registered,
            0
          );
          const sessionScannedRaw =
            scannedItemsProgress.get(item.product_id) || 0;
          const sessionScanned = Math.min(
            sessionScannedRaw,
            maxPendingAfterRegistered
          );
          const pending = Math.max(
            orderQuantity - registered - sessionScanned,
            0
          );
          const isComplete = pending === 0;

          return {
            item,
            orderQuantity,
            registered,
            sessionScanned,
            pending,
            isComplete,
          };
        }
      );

      const totalRequired = normalizedItems.reduce(
        (sum, x) => sum + x.orderQuantity,
        0
      );
      const totalRegistered = normalizedItems.reduce(
        (sum, x) => sum + x.registered,
        0
      );
      const totalScanned = normalizedItems.reduce(
        (sum, x) => sum + x.sessionScanned,
        0
      );
      const totalCompleted = Math.min(
        totalRegistered + totalScanned,
        totalRequired
      );

      return {
        items: normalizedItems,
        totalRequired,
        totalRegistered,
        totalScanned,
        totalCompleted,
      };
    },

  startExit: () => {
    const { warehouseId, exitMode, selectedUserId, selectedCustomerId, selectedDeliveryOrderId, selectedDeliveryOrder } = get();

    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
      return;
    }

    if (!exitMode) {
      set({ error: "Debe seleccionar un modo de salida" });
      return;
    }

    // Validar según el modo
    if (exitMode === 'direct_user') {
      if (!selectedUserId) {
        set({ error: "Debe seleccionar un usuario destinatario" });
        return;
      }

      if (!selectedDeliveryOrderId) {
        set({ error: "Debe seleccionar una remisión" });
        return;
      }

      // Validar que la remisión no esté completa
      const progress = get().getSelectedDeliveryOrderProgress();
      if (progress) {
        const isOrderComplete = progress.items.every(item => item.isComplete);
        if (isOrderComplete) {
          set({ error: "Esta remisión ya está completa. No se pueden registrar más productos." });
          return;
        }
      }
    }

    if (exitMode === 'direct_customer') {
      if (!selectedCustomerId) {
        set({ error: "Debe seleccionar un cliente destinatario" });
        return;
      }

      if (!selectedDeliveryOrderId) {
        set({ error: "Debe seleccionar una orden de entrega" });
        return;
      }

      // Validar que la orden no esté completa
      const progress = get().getSelectedDeliveryOrderProgress();
      if (progress) {
        const isOrderComplete = progress.items.every(item => item.isComplete);
        if (isOrderComplete) {
          set({ error: "Esta orden de entrega ya está completa. No se pueden registrar más productos." });
          return;
        }
      }
    }

    set({ step: "scanning", error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string) => {
    set({ loading: true, loadingMessage: 'Buscando producto...', error: null, currentScannedBarcode: barcode });

    try {
      const product = await get().searchProductByBarcode(barcode);

      if (!product) {
        set({
          loading: false,
          loadingMessage: null,
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
          loadingMessage: null,
          error: "Debe seleccionar una bodega primero",
          currentProduct: null,
          currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
        });
        return;
      }

      // Validar que haya una orden de entrega seleccionada (siempre requerida)
      if (!selectedDeliveryOrderId || !selectedDeliveryOrder) {
        set({
          loading: false,
          loadingMessage: null,
          error: "Debe seleccionar una orden de entrega primero",
          currentProduct: null,
          currentScannedBarcode: null,
        });
        return;
      }

      // Validar contra la orden de entrega
      const validation = get().validateProductAgainstOrder(
        product.id,
        1 // Validar con cantidad 1 inicialmente
      );

      if (!validation.valid) {
        set({
          loading: false,
          loadingMessage: null,
          error: validation.error || "Producto no válido para esta orden",
          currentProduct: null,
          currentScannedBarcode: null,
        });
        return;
      }

      // Calcular stock disponible basado en la orden de entrega
      set({ loadingMessage: 'Verificando disponibilidad en la orden...' });

      const orderItem = selectedDeliveryOrder.items.find(
        (item) => item.product_id === product.id && item.warehouse_id === warehouseId
      );

      if (!orderItem) {
        set({
          loading: false,
          loadingMessage: null,
          error: "Este producto no está incluido en la orden de entrega para esta bodega",
          currentProduct: null,
          currentScannedBarcode: null,
        });
        return;
      }

      // Calcular cantidad disponible en la orden
      const registeredExitsCache = get().registeredExitsCache;
      const registeredInBD = registeredExitsCache[selectedDeliveryOrderId]?.[product.id] || 0;
      const availableStock = Math.max(orderItem.quantity - registeredInBD, 0);

      if (availableStock <= 0) {
        set({
          loading: false,
          loadingMessage: null,
          error: `Este producto ya fue entregado completamente en esta orden. Cantidad en orden: ${orderItem.quantity}, Ya entregado: ${registeredInBD}`,
          currentProduct: null,
          currentScannedBarcode: null,
        });
        return;
      }

      set({
        loading: false,
        loadingMessage: null,
        currentProduct: product,
        currentQuantity: 1,
        currentAvailableStock: availableStock,
        error: null,
      });
    } catch (error: any) {
      console.error("Error scanning barcode:", error);
      set({
        loading: false,
        loadingMessage: null,
        error: error?.message || error?.toString() || "Error al escanear el código de barras. Por favor intente de nuevo.",
        currentProduct: null,
        currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
      });
    }
  },

  searchProductByBarcode: async (barcode: string): Promise<Product | null> => {
    try {
      if (!barcode || typeof barcode !== 'string' || barcode.trim() === '') {
        console.warn('Barcode inválido en searchProductByBarcode:', barcode);
        return null;
      }

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("barcode", barcode.trim())
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST116") {
          // Producto no encontrado - esto es normal
          return null;
        }
        console.error("Error searching product:", error);
        throw error;
      }

      return data as Product | null;
    } catch (error: any) {
      console.error("Error searching product:", error);
      // Retornar null en lugar de lanzar error para evitar crashes
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

    // Validar que haya una orden de entrega seleccionada (siempre requerida)
    const { selectedDeliveryOrder, registeredExitsCache } = get();
    if (!selectedDeliveryOrderId || !selectedDeliveryOrder) {
      set({ error: "Debe seleccionar una orden de entrega primero" });
      return;
    }

    // Validar contra la orden de entrega
    const validation = get().validateProductAgainstOrder(product.id, quantity);
    if (!validation.valid) {
      set({ error: validation.error });
      return;
    }

    // Calcular stock disponible basado en la orden
    const orderItem = selectedDeliveryOrder.items.find(
      (item) => item.product_id === product.id && item.warehouse_id === warehouseId
    );

    if (!orderItem) {
      set({ error: "Este producto no está en la orden de entrega para esta bodega" });
      return;
    }

    const registeredInBD = registeredExitsCache[selectedDeliveryOrderId]?.[product.id] || 0;
    const availableStock = Math.max(orderItem.quantity - registeredInBD, 0);

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
    const { exitItems, selectedDeliveryOrderId, scannedItemsProgress } = get();
    const itemToRemove = exitItems[index];

    if (!itemToRemove) return;

    const updatedItems = exitItems.filter((_, i) => i !== index);

    // Si hay una orden de entrega seleccionada, actualizar progreso
    if (selectedDeliveryOrderId && itemToRemove.product.id) {
      const currentProgress = scannedItemsProgress.get(itemToRemove.product.id) || 0;
      const newProgress = new Map(scannedItemsProgress);
      const newValue = Math.max(0, currentProgress - itemToRemove.quantity);

      if (newValue > 0) {
        newProgress.set(itemToRemove.product.id, newValue);
      } else {
        newProgress.delete(itemToRemove.product.id);
      }

      set({ exitItems: updatedItems, scannedItemsProgress: newProgress });
    } else {
      set({ exitItems: updatedItems });
    }
  },

  updateProductQuantity: (index: number, quantity: number) => {
    const { exitItems, warehouseId, selectedDeliveryOrderId, scannedItemsProgress } = get();

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

    // Si hay una orden de entrega seleccionada, actualizar progreso
    if (selectedDeliveryOrderId && item.product.id) {
      const currentProgress = scannedItemsProgress.get(item.product.id) || 0;
      const quantityDelta = quantity - item.quantity;
      const newProgress = new Map(scannedItemsProgress);
      const newValue = Math.max(0, currentProgress + quantityDelta);

      if (newValue > 0) {
        newProgress.set(item.product.id, newValue);
      } else {
        newProgress.delete(item.product.id);
      }

      set({ exitItems: updatedItems, scannedItemsProgress: newProgress, error: null });
    } else {
      set({ exitItems: updatedItems, error: null });
    }
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

    // Establecer loading al inicio del proceso
    set({ loading: true, loadingMessage: 'Registrando salida...' });

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
          // Si hay una remisión seleccionada, agregarla
          if (selectedDeliveryOrderId) {
            baseExit.delivery_order_id = selectedDeliveryOrderId;
          }
        } else if (exitMode === 'direct_customer') {
          baseExit.delivered_to_customer_id = selectedCustomerId;
          // Si hay una orden de entrega seleccionada, agregarla
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
      set({ loadingMessage: 'Guardando productos en el inventario...' });

      const { data: insertedExits, error: exitsError } = await supabase
        .from("inventory_exits")
        .insert(exits)
        .select();

      if (exitsError) {
        console.error("Error inserting exits:", exitsError);
        return { error: exitsError };
      }

      // Verificar que se insertaron correctamente
      if (!insertedExits || insertedExits.length === 0) {
        console.error("No se insertaron las salidas correctamente");
        return { error: { message: "Error al registrar las salidas. No se insertaron registros." } };
      }

      if (insertedExits.length !== exits.length) {
        console.warn(`Se insertaron ${insertedExits.length} de ${exits.length} salidas`);
      }

      // Si hay una orden de entrega seleccionada, actualizar el progreso de la orden
      if (selectedDeliveryOrderId && selectedDeliveryOrder) {
        set({ loadingMessage: 'Actualizando progreso de la orden...' });

        // Guardar el orderId y actualizar el cache antes de resetear
        const orderIdToRefresh = selectedDeliveryOrderId;
        const { registeredExitsCache } = get();
        let updatedCache = { ...registeredExitsCache };

        // Inicializar el cache para esta orden si no existe
        if (!updatedCache[selectedDeliveryOrderId]) {
          updatedCache[selectedDeliveryOrderId] = {};
        }

        let orderCompleted = false;
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
          } else if (data && data.success) {
            // Usar el valor actualizado que retorna la función RPC (ya incluye la suma)
            const currentDelivered = data.current_delivered || 0;
            const previousValue = updatedCache[selectedDeliveryOrderId][item.product.id] || 0;
            updatedCache[selectedDeliveryOrderId][item.product.id] = currentDelivered;
            console.log(`[finalizeExit] Product ${item.product.id}: Updated cache from ${previousValue} to ${currentDelivered} (added ${item.quantity})`);

            if (data.all_delivered) {
              orderCompleted = true;
              console.log("Orden de entrega completada y marcada como recibida:", selectedDeliveryOrderId);
            }
          } else if (data && !data.success) {
            console.error("Error en update_delivery_order_progress:", data.error);
          }
        }

        // Si la orden fue completada, recargar la información de la orden para reflejar el nuevo estado
        if (orderCompleted) {
          set({ loadingMessage: 'Actualizando estado de la orden...' });
          await get().selectDeliveryOrder(orderIdToRefresh);
        }

        // Recargar desde inventory_exits para sincronizar el cache (fuente de verdad)
        try {
          // Primero obtener los IDs de salidas canceladas para excluirlas
          const { data: cancelledExits, error: cancelledError } = await supabase
            .from("inventory_exit_cancellations")
            .select("inventory_exit_id");

          const cancelledExitIds = new Set(
            (cancelledExits || []).map((c: any) => c.inventory_exit_id)
          );

          // Obtener todas las salidas y filtrar las canceladas
          const { data: exitsData, error: exitsError } = await supabase
            .from("inventory_exits")
            .select("id, product_id, quantity")
            .eq("delivery_order_id", orderIdToRefresh);

          if (!exitsError && exitsData) {
            // Calcular cantidades registradas por producto desde inventory_exits (excluyendo canceladas)
            const registeredByProduct: Record<string, number> = {};
            exitsData.forEach((exit: any) => {
              // Excluir salidas canceladas
              if (cancelledExitIds.has(exit.id)) return;
              if (!exit.product_id) return;
              registeredByProduct[exit.product_id] =
                (registeredByProduct[exit.product_id] || 0) + (exit.quantity || 0);
            });

            // Obtener los items de la orden para truncar las cantidades
            const { data: orderData } = await supabase
              .from('delivery_orders')
              .select(`
                items:delivery_order_items(
                  product_id,
                  quantity
                )
              `)
              .eq('id', orderIdToRefresh)
              .single();

            const finalCache = { ...updatedCache };

            if (!finalCache[orderIdToRefresh]) {
              finalCache[orderIdToRefresh] = {};
            }

            // Actualizar el cache con los valores desde inventory_exits (truncados)
            if (orderData?.items) {
              orderData.items.forEach((item: any) => {
                const rawRegistered = registeredByProduct[item.product_id] || 0;
                const clampedRegistered = Math.min(rawRegistered, item.quantity);

                if (clampedRegistered > 0) {
                  finalCache[orderIdToRefresh][item.product_id] = clampedRegistered;
                } else {
                  // Eliminar del cache si no hay cantidad registrada
                  delete finalCache[orderIdToRefresh][item.product_id];
                }
                console.log(`[finalizeExit] Product ${item.product_id}: Refreshed cache from inventory_exits: registered=${clampedRegistered} (raw=${rawRegistered}, max=${item.quantity})`);
              });
            }

            set({ registeredExitsCache: finalCache });
          }
        } catch (refreshError) {
          console.error("Error refreshing delivery order cache from inventory_exits:", refreshError);
        }
      }

      // Resetear todo después de finalizar
      get().reset();

      // Limpiar loading después de finalizar exitosamente
      set({ loading: false, loadingMessage: null });
      return { error: null };
    } catch (error: any) {
      console.error("Error finalizing exit:", error);
      // Limpiar loading en caso de error
      set({ loading: false, loadingMessage: null });
      return { error };
    }
  },

  // Reset actions
  reset: () => {
    // NO resetear registeredExitsCache para mantener los valores actualizados
    // El cache se mantiene para que las validaciones futuras sean correctas
    set({
      warehouseId: null,
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      step: "setup",
      error: null,
      loading: false,
      loadingMessage: null,
      exitMode: null,
      selectedUserId: null,
      selectedCustomerId: null,
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      scannedItemsProgress: new Map(),
      // registeredExitsCache se mantiene - NO resetear
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
      exitItems: [], // Limpiar items de salida
      scannedItemsProgress: new Map(), // Limpiar progreso de escaneo
    });
  },
}));

