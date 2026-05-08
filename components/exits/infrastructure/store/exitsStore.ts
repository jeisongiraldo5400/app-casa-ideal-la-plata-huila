import {
  buildRegisteredTotalsByKey,
  computeFifoProgressByItemId
} from '@/components/exits/infrastructure/utils/fifoDeliveryAllocation';
import { compositeKey } from '@/components/exits/infrastructure/utils/compositeKey';
import { logOperationError } from '@/lib/operationLogger';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { create } from 'zustand';

type Product = Database['public']['Tables']['products']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type InventoryExit = Database['public']['Tables']['inventory_exits']['Insert'];

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
  /** Entregado mostrado (reparto FIFO cuando hay varias líneas mismo producto+bodega). */
  delivered_quantity: number;
  pending_quantity: number;
  /** Valor en BD por fila (delivery_order_items.delivered_quantity). */
  db_delivered_quantity: number;
  created_at: string;
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

const UNAUTHORIZED_EXIT_MESSAGE =
  'No estás autorizado para registrar la salida de inventario de esta orden.';

type ExitAuthorizationResult = {
  canRegister: boolean;
  message: string | null;
};

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
  /** Línea de orden objetivo al escanear (p. ej. segunda fila mismo SKU). */
  targetOrderItemId: string | null;

  // Estado de UI
  loading: boolean;
  customersLoading: boolean;
  loadingMessage: string | null;
  error: string | null;
  step: 'setup' | 'scanning';

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
  scannedItemsProgress: Map<string, number>; // compositeKey(product_id, warehouse_id) -> cantidad escaneada
  canRegisterExit: boolean;
  authorizationMessage: string | null;

  // Cache de salidas registradas por orden y producto+bodega (para evitar consultas redundantes)
  registeredExitsCache: Record<string, Record<string, number>>; // orderId -> compositeKey(product_id, warehouse_id) -> quantity

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
  validateCurrentUserAuthorizationForOrder: (
    orderId: string
  ) => Promise<ExitAuthorizationResult>;
  validateProductAgainstOrder: (
    productId: string,
    warehouseId: string,
    quantity: number,
    targetOrderItemId?: string | null
  ) => {
    valid: boolean;
    error?: string;
    orderItem?: DeliveryOrderItem;
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
  resetAll: () => void;
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
  targetOrderItemId: null,

  // UI
  loading: false,
  customersLoading: false,
  loadingMessage: null,
  error: null,
  step: 'setup',

  // Datos
  warehouses: [],
  users: [],
  customers: [],
  customerSearchTerm: '',
  deliveryOrders: [],
  selectedDeliveryOrder: null,
  scannedItemsProgress: new Map(),
  canRegisterExit: true,
  authorizationMessage: null,
  registeredExitsCache: {},
  deliveryObservations: '',

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
      canRegisterExit: true,
      authorizationMessage: null
    });
  },

  setSelectedUser: (userId) => {
    set({
      selectedUserId: userId,
      // Reset delivery order when user changes
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      canRegisterExit: true,
      authorizationMessage: null
    });
  },

  setSelectedCustomer: (customerId) => {
    set({
      selectedCustomerId: customerId,
      // Reset delivery order when customer changes
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      canRegisterExit: true,
      authorizationMessage: null
    });
  },

  validateCurrentUserAuthorizationForOrder: async (
    orderId: string
  ): Promise<ExitAuthorizationResult> => {
    try {
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return {
          canRegister: false,
          message: UNAUTHORIZED_EXIT_MESSAGE
        };
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from('delivery_order_pickup_assignments')
        .select('user_id')
        .eq('delivery_order_id', orderId)
        .is('deleted_at', null);

      if (assignmentsError) {
        console.error('Error loading pickup assignments:', assignmentsError);
        return {
          canRegister: false,
          message: UNAUTHORIZED_EXIT_MESSAGE
        };
      }

      // Fetch current user's roles regardless of assignment status.
      // Bodegueros and admins are always authorized by default.
      const { data: userRolesData, error: userRolesError } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id);

      if (userRolesError) {
        console.error('Error loading user roles:', userRolesError);
        return {
          canRegister: false,
          message: UNAUTHORIZED_EXIT_MESSAGE
        };
      }

      const roleIds = (userRolesData || []).map((role) => role.role_id);
      let isDefaultAuthorized = false;

      if (roleIds.length > 0) {
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('nombre')
          .in('id', roleIds)
          .is('deleted_at', null);

        if (rolesError) {
          console.error('Error loading role names:', rolesError);
          return {
            canRegister: false,
            message: UNAUTHORIZED_EXIT_MESSAGE
          };
        }

        isDefaultAuthorized = (rolesData || []).some((role) =>
          ['bodeguero', 'admin'].includes(role.nombre?.toLowerCase())
        );
      }

      // Default-authorized users (bodeguero / admin) can always register exits.
      if (isDefaultAuthorized) {
        return { canRegister: true, message: null };
      }

      // For other roles, access is granted only when the order has no explicit
      // assignments (open order) OR the user is explicitly assigned to the order.
      const hasAssignments = (assignments || []).length > 0;
      if (!hasAssignments) {
        return {
          canRegister: false,
          message: UNAUTHORIZED_EXIT_MESSAGE
        };
      }

      const isAssignedUser = (assignments || []).some(
        (assignment) => assignment.user_id === user.id
      );

      return {
        canRegister: isAssignedUser,
        message: isAssignedUser ? null : UNAUTHORIZED_EXIT_MESSAGE
      };
    } catch (error) {
      console.error('Error validating exit authorization:', error);
      return {
        canRegister: false,
        message: UNAUTHORIZED_EXIT_MESSAGE
      };
    }
  },

  setDeliveryObservations: (observations) => {
    set({ deliveryObservations: observations });
  },

  loadWarehouses: async () => {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error loading warehouses:', error);
        set({ warehouses: [] });
        return;
      }
      set({ warehouses: data || [] });
    } catch (error: any) {
      console.error('Error loading warehouses:', error);
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
        console.error('Error loading users:', error);
        set({ users: [] });
        return;
      }
      set({ users: (data as Profile[]) || [] });
    } catch (error: any) {
      console.error('Error loading users:', error);
      set({ users: [] });
    }
  },

  searchCustomers: async (searchTerm: string) => {
    set({ customerSearchTerm: searchTerm, customersLoading: true });

    try {
      // Buscar directamente en la tabla customers
      let query = supabase
        .from('customers')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      // Si hay término de búsqueda, filtrar por nombre o número de identificación
      if (searchTerm && searchTerm.trim()) {
        query = query.or(
          `name.ilike.%${searchTerm}%,id_number.ilike.%${searchTerm}%`
        );
      }

      const { data, error } = await query.limit(50);

      // Evitar que respuestas antiguas sobrescriban resultados recientes
      if (get().customerSearchTerm !== searchTerm) {
        return;
      }

      if (error) {
        console.error('Error searching customers:', error);
        set({ customers: [], customersLoading: false });
        return;
      }
      set({ customers: data || [], customersLoading: false });
    } catch (error: any) {
      console.error('Error searching customers:', error);
      if (get().customerSearchTerm === searchTerm) {
        set({ customers: [], customersLoading: false });
      }
    }
  },

  searchDeliveryOrdersByCustomer: async (customerId: string) => {
    set({ loading: true, loadingMessage: 'Cargando órdenes de entrega...' });

    try {
      // Consulta directa a la tabla delivery_orders con agregación de items
      const { data, error } = await supabase
        .from('delivery_orders')
        .select(
          `
          *,
          items:delivery_order_items!fk_delivery_order_item_order!inner(
            id,
            product_id,
            warehouse_id,
            quantity,
            delivered_quantity,
            deleted_at,
            product:products!inner(id, name, barcode, sku, deleted_at)
          )
        `
        )
        .eq('customer_id', customerId)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .is('items.deleted_at', null)
        .is('items.product.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading delivery orders:', error);
        set({
          deliveryOrders: [],
          loading: false,
          loadingMessage: null,
          error: error.message
        });
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
        .from('inventory_exit_cancellations')
        .select('inventory_exit_id');

      const cancelledExitIds = new Set(
        (cancelledExits || []).map((c: any) => c.inventory_exit_id)
      );

      // Obtener todas las salidas y filtrar las canceladas
      const { data: exitsData, error: exitsError } = await supabase
        .from('inventory_exits')
        .select('id, delivery_order_id, product_id, warehouse_id, quantity')
        .in('delivery_order_id', orderIds);

      if (exitsError) {
        console.error(
          'Error loading inventory exits for delivery orders:',
          exitsError
        );
      }

      // Agrupar salidas por order_id y compositeKey(product_id, warehouse_id) (excluyendo canceladas)
      const exitsByOrder = new Map<string, Map<string, number>>();
      (exitsData || []).forEach((exit: any) => {
        // Excluir salidas canceladas
        if (cancelledExitIds.has(exit.id)) return;
        if (!exit.delivery_order_id || !exit.product_id || !exit.warehouse_id)
          return;
        if (!exitsByOrder.has(exit.delivery_order_id)) {
          exitsByOrder.set(exit.delivery_order_id, new Map());
        }
        const key = compositeKey(exit.product_id, exit.warehouse_id);
        const productMap = exitsByOrder.get(exit.delivery_order_id)!;
        productMap.set(key, (productMap.get(key) || 0) + (exit.quantity || 0));
      });

      // Transformar los datos para incluir contadores (reconciliando BD con inventory_exits)
      const ordersWithCounts = data.map((order: any) => {
        // Filtrar items eliminados (seguridad adicional)
        const activeItems = (order.items || []).filter(
          (item: any) =>
            !item.deleted_at && item.product && !item.product.deleted_at
        );

        const orderExits = exitsByOrder.get(order.id) || new Map();
        let totalDelivered = 0;
        const totalQuantity =
          activeItems.reduce((sum: number, item: any) => {
            const key = compositeKey(item.product_id, item.warehouse_id);
            const fromExits = orderExits.get(key) || 0;
            const fromDB = item.delivered_quantity || 0;
            const bestEstimate = Math.max(fromExits, fromDB);
            const clampedDelivered = Math.min(bestEstimate, item.quantity);
            totalDelivered += clampedDelivered;
            return sum + item.quantity;
          }, 0) || 0;

        return {
          ...order,
          items: activeItems, // Guardar solo items activos
          total_items: activeItems.length,
          total_quantity: totalQuantity,
          delivered_quantity: totalDelivered
        };
      });

      // Filtrar solo las órdenes que NO están completadas (delivered_quantity < total_quantity)
      // Esto evita sobrecargar el sistema mostrando órdenes que ya no necesitan procesamiento
      const incompleteOrders = ordersWithCounts.filter(
        (order: any) =>
          order.total_quantity > 0 &&
          order.delivered_quantity < order.total_quantity
      );

      set({
        deliveryOrders: incompleteOrders,
        loading: false,
        loadingMessage: null
      });
    } catch (error: any) {
      console.error('Error loading delivery orders:', error);
      set({
        deliveryOrders: [],
        loading: false,
        loadingMessage: null,
        error: error.message
      });
    }
  },

  searchDeliveryOrdersByUser: async (userId: string) => {
    set({ loading: true, loadingMessage: 'Cargando órdenes...' });

    try {
      // Usar RPC que expande remisiones en órdenes independientes
      const { data, error } = await supabase.rpc(
        'get_user_delivery_orders_expanded',
        {
          p_user_id: userId
        }
      );

      if (error) {
        console.error('Error loading orders:', error);
        set({
          deliveryOrders: [],
          loading: false,
          loadingMessage: null,
          error: error.message
        });
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
        .from('inventory_exit_cancellations')
        .select('inventory_exit_id');

      const cancelledExitIds = new Set(
        (cancelledExits || []).map((c: any) => c.inventory_exit_id)
      );

      // Obtener todas las salidas y filtrar las canceladas
      const { data: exitsData, error: exitsError } = await supabase
        .from('inventory_exits')
        .select('id, delivery_order_id, product_id, warehouse_id, quantity')
        .in('delivery_order_id', orderIds);

      if (exitsError) {
        console.error('Error loading inventory exits for orders:', exitsError);
      }

      // Agrupar salidas por order_id y compositeKey(product_id, warehouse_id) (excluyendo canceladas)
      const exitsByOrder = new Map<string, Map<string, number>>();
      (exitsData || []).forEach((exit: any) => {
        // Excluir salidas canceladas
        if (cancelledExitIds.has(exit.id)) return;
        if (!exit.delivery_order_id || !exit.product_id || !exit.warehouse_id)
          return;
        if (!exitsByOrder.has(exit.delivery_order_id)) {
          exitsByOrder.set(exit.delivery_order_id, new Map());
        }
        const key = compositeKey(exit.product_id, exit.warehouse_id);
        const productMap = exitsByOrder.get(exit.delivery_order_id)!;
        productMap.set(key, (productMap.get(key) || 0) + (exit.quantity || 0));
      });

      // Obtener delivered_quantity desde delivery_order_items (fuente de verdad en BD)
      const { data: dbItems, error: dbItemsError } = await supabase
        .from('delivery_order_items')
        .select('delivery_order_id, delivered_quantity')
        .in('delivery_order_id', orderIds)
        .is('deleted_at', null);

      // Agrupar delivered_quantity de BD por order_id
      const dbDeliveredByOrder = new Map<string, number>();
      if (!dbItemsError && dbItems) {
        dbItems.forEach((item: any) => {
          const current = dbDeliveredByOrder.get(item.delivery_order_id) || 0;
          dbDeliveredByOrder.set(
            item.delivery_order_id,
            current + (item.delivered_quantity || 0)
          );
        });
      }

      // Calcular delivered_quantity para cada orden (reconciliando BD con inventory_exits)
      const ordersWithProgress = orders.map((order: any) => {
        const orderExits = exitsByOrder.get(order.id) || new Map();

        // Sumar todas las salidas registradas para esta orden
        let totalFromExits = 0;
        orderExits.forEach((quantity) => {
          totalFromExits += quantity;
        });

        // Usar el mayor entre el valor de BD y el calculado desde inventory_exits
        const totalFromDB = dbDeliveredByOrder.get(order.id) || 0;
        const bestEstimate = Math.max(totalFromExits, totalFromDB);
        const clampedDelivered = Math.min(
          bestEstimate,
          order.total_quantity || 0
        );

        return {
          ...order,
          delivered_quantity: clampedDelivered
        };
      });

      // Filtrar solo las órdenes que NO están completadas (delivered_quantity < total_quantity)
      const incompleteOrders = ordersWithProgress.filter(
        (order: any) =>
          order.total_quantity > 0 &&
          order.delivered_quantity < order.total_quantity
      );

      set({
        deliveryOrders: incompleteOrders,
        loading: false,
        loadingMessage: null
      });
    } catch (error: any) {
      console.error('Error loading orders:', error);
      set({
        deliveryOrders: [],
        loading: false,
        loadingMessage: null,
        error: error.message
      });
    }
  },

  selectDeliveryOrder: async (orderId: string) => {
    set({
      loading: true,
      loadingMessage: 'Cargando detalles de la orden...',
      error: null
    });

    try {
      // Consulta directa con joins para obtener todos los detalles
      const { data: orderData, error: orderError } = await supabase
        .from('delivery_orders')
        .select(
          `
          *,
          customer:customers(id, name, id_number),
          assigned_to_user:profiles(id, full_name, email),
          items:delivery_order_items!fk_delivery_order_item_order!inner(
            id,
            product_id,
            warehouse_id,
            quantity,
            delivered_quantity,
            created_at,
            deleted_at,
            source_delivery_order_id,
            product:products!inner(id, name, barcode, sku, deleted_at),
            warehouse:warehouses(id, name)
          )
        `
        )
        .eq('id', orderId)
        .is('items.deleted_at', null)
        .is('items.product.deleted_at', null)
        .single();

      if (orderError) {
        console.error('Error loading delivery order details:', orderError);
        logOperationError({
          error_code: 'DELIVERY_ORDER_LOAD_FAILED',
          error_message: orderError.message || String(orderError),
          module: 'exits',
          operation: 'select_delivery_order',
          step: 'query',
          entity_type: 'delivery_order',
          entity_id: orderId
        });
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
          error: 'Orden de entrega no encontrada'
        });
        return;
      }

      // Obtener las salidas de inventario para esta orden desde inventory_exits
      // Primero obtener los IDs de salidas canceladas para excluirlas
      const { data: cancelledExits, error: cancelledError } = await supabase
        .from('inventory_exit_cancellations')
        .select('inventory_exit_id');

      const cancelledExitIds = new Set(
        (cancelledExits || []).map((c: any) => c.inventory_exit_id)
      );

      // Obtener todas las salidas y filtrar las canceladas
      const { data: exitsData, error: exitsError } = await supabase
        .from('inventory_exits')
        .select('id, product_id, warehouse_id, quantity')
        .eq('delivery_order_id', orderId);

      if (exitsError) {
        console.error(
          'Error loading inventory exits for delivery order:',
          exitsError
        );
        // Continuar aunque haya error, pero con cache vacío
      }

      // Calcular cantidades registradas por compositeKey(product_id, warehouse_id) desde inventory_exits (excluyendo canceladas)
      const registeredByProduct: Record<string, number> = {};
      (exitsData || []).forEach((exit: any) => {
        // Excluir salidas canceladas
        if (cancelledExitIds.has(exit.id)) return;
        if (!exit.product_id || !exit.warehouse_id) return;
        const key = compositeKey(exit.product_id, exit.warehouse_id);
        registeredByProduct[key] =
          (registeredByProduct[key] || 0) + (exit.quantity || 0);
      });

      // Transformar los datos al formato esperado
      // Para remisiones (assigned_to_user_id), usar el nombre del usuario asignado
      // Para clientes (customer_id), usar el nombre del cliente
      const customerName =
        orderData.customer?.name || orderData.assigned_to_user?.full_name || '';
      const customerIdNumber = orderData.customer?.id_number || '';

      // Incluir TODOS los items (directos + de órdenes asignadas)
      // Filtrar items con deleted_at o productos eliminados (seguridad adicional)
      const activeItems = (orderData.items || []).filter(
        (item: any) =>
          !item.deleted_at && item.product && !item.product.deleted_at
      );

      const fifoInputs = activeItems.map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        quantity: Number(item.quantity) || 0,
        db_delivered_quantity: Number(item.delivered_quantity) || 0,
        created_at: item.created_at || '1970-01-01T00:00:00.000Z'
      }));

      const registeredTotalsForOrder = buildRegisteredTotalsByKey(
        fifoInputs,
        registeredByProduct
      );
      const fifoAllocated = computeFifoProgressByItemId(
        fifoInputs,
        registeredTotalsForOrder,
        new Map()
      );

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
        items: activeItems.map((item: any) => {
          const fp = fifoAllocated.get(item.id) ?? {
            registered: 0,
            sessionScanned: 0,
            pending: Number(item.quantity) || 0
          };
          const dbDel = Number(item.delivered_quantity) || 0;
          return {
            id: item.id,
            product_id: item.product_id,
            product_name: item.product?.name || '',
            product_barcode: item.product?.barcode || '',
            product_sku: item.product?.sku || null,
            warehouse_id: item.warehouse_id,
            warehouse_name: item.warehouse?.name || '',
            quantity: Number(item.quantity) || 0,
            delivered_quantity: fp.registered,
            pending_quantity: fp.pending,
            db_delivered_quantity: dbDel,
            created_at: item.created_at || '1970-01-01T00:00:00.000Z'
          };
        })
      };

      const authorizationResult =
        await get().validateCurrentUserAuthorizationForOrder(orderId);

      const { registeredExitsCache } = get();
      const updatedCache = { ...registeredExitsCache };

      updatedCache[orderId] = { ...registeredTotalsForOrder };
      Object.keys(updatedCache[orderId]).forEach((k) => {
        if (updatedCache[orderId][k] <= 0) delete updatedCache[orderId][k];
      });

      Object.entries(updatedCache[orderId]).forEach(([key, total]) => {
        console.log(
          `[selectDeliveryOrder] ${key}: aggregate registered=${total}`
        );
      });

      set({
        selectedDeliveryOrder: deliveryOrder,
        selectedDeliveryOrderId: orderId,
        scannedItemsProgress: new Map(),
        registeredExitsCache: updatedCache,
        canRegisterExit: authorizationResult.canRegister,
        authorizationMessage: authorizationResult.message,
        loading: false,
        loadingMessage: null
      });
    } catch (error: any) {
      console.error('Error loading delivery order details:', error);
      set({
        selectedDeliveryOrder: null,
        selectedDeliveryOrderId: null,
        canRegisterExit: true,
        authorizationMessage: null,
        loading: false,
        loadingMessage: null,
        error: error.message
      });
    }
  },

  validateProductAgainstOrder: (
    productId: string,
    warehouseId: string,
    quantity: number,
    targetOrderItemId?: string | null
  ) => {
    const {
      selectedDeliveryOrder,
      selectedDeliveryOrderId,
      registeredExitsCache,
      scannedItemsProgress,
      exitItems
    } = get();

    if (!selectedDeliveryOrder || !selectedDeliveryOrderId) {
      return { valid: false, error: 'No hay orden de entrega seleccionada' };
    }

    const matchingItems = selectedDeliveryOrder.items.filter(
      (item) =>
        item.product_id === productId && item.warehouse_id === warehouseId
    );

    if (matchingItems.length === 0) {
      return {
        valid: false,
        error:
          'Este producto no está incluido en la orden de entrega para esta bodega'
      };
    }

    const totalRequired = matchingItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const sumDbDelivered = matchingItems.reduce(
      (sum, item) => sum + item.db_delivered_quantity,
      0
    );

    const key = compositeKey(productId, warehouseId);
    const cacheSlice = registeredExitsCache[selectedDeliveryOrderId] || {};
    const cacheTotal = cacheSlice[key] ?? 0;

    const totalDelivered = Math.min(
      Math.max(sumDbDelivered, cacheTotal),
      totalRequired
    );

    const sessionTotal = exitItems
      .filter(
        (item) =>
          item.product.id === productId && item.warehouseId === warehouseId
      )
      .reduce((sum, item) => sum + item.quantity, 0);

    const newTotal = totalDelivered + sessionTotal + quantity;
    if (newTotal > totalRequired) {
      const maxAllowable = Math.max(
        totalRequired - totalDelivered - sessionTotal,
        0
      );
      return {
        valid: false,
        error: `La cantidad excede lo requerido. Requerido: ${totalRequired}, Ya entregado: ${totalDelivered}, En esta sesión: ${sessionTotal}, Máximo permitido: ${maxAllowable}`
      };
    }

    const fifoProgress = computeFifoProgressByItemId(
      selectedDeliveryOrder.items,
      cacheSlice,
      scannedItemsProgress
    );

    let orderItem: DeliveryOrderItem | undefined;
    if (targetOrderItemId) {
      orderItem = matchingItems.find((i) => i.id === targetOrderItemId);
    }
    if (!orderItem) {
      const sortedMatches = [...matchingItems].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
          a.id.localeCompare(b.id)
      );
      orderItem = sortedMatches.find(
        (i) => (fifoProgress.get(i.id)?.pending ?? 0) > 0
      );
    }
    if (!orderItem) {
      orderItem = matchingItems[0];
    }

    return { valid: true, orderItem };
  },

  getSelectedDeliveryOrderProgress:
    (): SelectedDeliveryOrderProgress | null => {
      const {
        selectedDeliveryOrder,
        selectedDeliveryOrderId,
        registeredExitsCache,
        scannedItemsProgress
      } = get();

      if (!selectedDeliveryOrder || !selectedDeliveryOrderId) {
        return null;
      }

      const items = selectedDeliveryOrder.items || [];
      const cacheSlice =
        registeredExitsCache[selectedDeliveryOrderId] || {};
      const fifoProgress = computeFifoProgressByItemId(
        items,
        cacheSlice,
        scannedItemsProgress
      );

      const normalizedItems: SelectedDeliveryOrderProgressItem[] = items.map(
        (item) => {
          const fp = fifoProgress.get(item.id) ?? {
            registered: 0,
            sessionScanned: 0,
            pending: item.quantity
          };
          return {
            item,
            orderQuantity: item.quantity,
            registered: fp.registered,
            sessionScanned: fp.sessionScanned,
            pending: fp.pending,
            isComplete: fp.pending === 0
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
        totalCompleted
      };
    },

  startExit: () => {
    const {
      warehouseId,
      exitMode,
      selectedUserId,
      selectedCustomerId,
      selectedDeliveryOrderId,
      selectedDeliveryOrder,
      canRegisterExit,
      authorizationMessage
    } = get();

    if (!exitMode) {
      set({ error: 'Debe seleccionar un modo de salida' });
      return;
    }

    // Validar según el modo
    if (exitMode === 'direct_user') {
      if (!selectedUserId) {
        set({ error: 'Debe seleccionar un usuario destinatario' });
        return;
      }

      if (!canRegisterExit) {
        set({ error: authorizationMessage || UNAUTHORIZED_EXIT_MESSAGE });
        return;
      }

      if (!selectedDeliveryOrderId) {
        set({ error: 'Debe seleccionar una remisión' });
        return;
      }

      // Validar que la remisión no esté completa
      const progress = get().getSelectedDeliveryOrderProgress();
      if (progress) {
        const isOrderComplete = progress.items.every((item) => item.isComplete);
        if (isOrderComplete) {
          set({
            error:
              'Esta remisión ya está completa. No se pueden registrar más productos.'
          });
          return;
        }
      }
    }

    if (exitMode === 'direct_customer') {
      if (!selectedCustomerId) {
        set({ error: 'Debe seleccionar un cliente destinatario' });
        return;
      }

      if (!canRegisterExit) {
        set({ error: authorizationMessage || UNAUTHORIZED_EXIT_MESSAGE });
        return;
      }

      if (!selectedDeliveryOrderId) {
        set({ error: 'Debe seleccionar una orden de entrega' });
        return;
      }

      // Validar que la orden no esté completa
      const progress = get().getSelectedDeliveryOrderProgress();
      if (progress) {
        const isOrderComplete = progress.items.every((item) => item.isComplete);
        if (isOrderComplete) {
          set({
            error:
              'Esta orden de entrega ya está completa. No se pueden registrar más productos.'
          });
          return;
        }
      }
    }

    set({ step: 'scanning', error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string) => {
    set({
      loading: true,
      loadingMessage: 'Buscando producto...',
      error: null,
      currentScannedBarcode: barcode
    });

    try {
      const product = await get().searchProductByBarcode(barcode);

      if (!product) {
        set({
          loading: false,
          loadingMessage: null,
          error:
            'Producto no encontrado. Este código de barras no está registrado en el sistema.',
          currentProduct: null,
          currentScannedBarcode: null,
          targetOrderItemId: null
        });
        return;
      }

      const {
        selectedDeliveryOrderId,
        selectedDeliveryOrder,
        registeredExitsCache,
        scannedItemsProgress
      } = get();

      // Validar que haya una orden de entrega seleccionada (siempre requerida)
      if (!selectedDeliveryOrderId || !selectedDeliveryOrder) {
        set({
          loading: false,
          loadingMessage: null,
          error: 'Debe seleccionar una orden de entrega primero',
          currentProduct: null,
          currentScannedBarcode: null,
          targetOrderItemId: null
        });
        return;
      }

      // Resolver la bodega automáticamente desde los items de la orden
      // Buscar líneas con pendientes (FIFO por created_at cuando hay varias filas mismo SKU)
      set({ loadingMessage: 'Verificando disponibilidad en la orden...' });

      const cacheSlice = registeredExitsCache[selectedDeliveryOrderId] || {};
      const fifoMap = computeFifoProgressByItemId(
        selectedDeliveryOrder.items,
        cacheSlice,
        scannedItemsProgress
      );

      const matchingItems = selectedDeliveryOrder.items
        .filter((item) => {
          if (item.product_id !== product.id) return false;
          return (fifoMap.get(item.id)?.pending ?? 0) > 0;
        })
        .sort((a, b) => {
          const t =
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime();
          if (t !== 0) return t;
          return a.id.localeCompare(b.id);
        });

      if (matchingItems.length === 0) {
        // Verificar si el producto existe en la orden pero ya está completado
        const existsInOrder = selectedDeliveryOrder.items.some(
          (item) => item.product_id === product.id
        );
        if (existsInOrder) {
          set({
            loading: false,
            loadingMessage: null,
            error:
              'Este producto ya fue entregado completamente en esta orden.',
            currentProduct: null,
            currentScannedBarcode: null,
            targetOrderItemId: null
          });
        } else {
          set({
            loading: false,
            loadingMessage: null,
            error: 'Este producto no está incluido en la orden de entrega.',
            currentProduct: null,
            currentScannedBarcode: null,
            targetOrderItemId: null
          });
        }
        return;
      }

      const selectedItem = matchingItems[0];
      const resolvedWarehouseId = selectedItem.warehouse_id;

      const validation = get().validateProductAgainstOrder(
        product.id,
        resolvedWarehouseId,
        1,
        selectedItem.id
      );

      if (!validation.valid) {
        set({
          loading: false,
          loadingMessage: null,
          error: validation.error || 'Producto no válido para esta orden',
          currentProduct: null,
          currentScannedBarcode: null,
          targetOrderItemId: null
        });
        return;
      }

      const fp = fifoMap.get(selectedItem.id) ?? {
        pending: selectedItem.pending_quantity,
        registered: selectedItem.delivered_quantity,
        sessionScanned: 0
      };
      const availableStock = fp.pending;

      set({
        loading: false,
        loadingMessage: null,
        currentProduct: product,
        currentQuantity: 1,
        currentAvailableStock: availableStock,
        warehouseId: resolvedWarehouseId,
        targetOrderItemId: selectedItem.id,
        error: null
      });
    } catch (error: any) {
      console.error('Error scanning barcode:', error);
      set({
        loading: false,
        loadingMessage: null,
        error:
          error?.message ||
          error?.toString() ||
          'Error al escanear el código de barras. Por favor intente de nuevo.',
        currentProduct: null,
        currentScannedBarcode: null,
        targetOrderItemId: null
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
        .from('products')
        .select('*')
        .eq('barcode', barcode.trim())
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST116') {
          // Producto no encontrado - esto es normal
          return null;
        }
        console.error('Error searching product:', error);
        throw error;
      }

      return data as Product | null;
    } catch (error: any) {
      console.error('Error searching product:', error);
      // Retornar null en lugar de lanzar error para evitar crashes
      return null;
    }
  },

  addProductToExit: async (
    product: Product,
    quantity: number,
    barcode: string
  ) => {
    const {
      exitItems,
      warehouseId,
      currentProduct,
      currentAvailableStock,
      exitMode,
      scannedItemsProgress,
      selectedDeliveryOrderId
    } = get();

    // warehouseId se resuelve automáticamente desde scanBarcode (de la orden de entrega)
    if (!warehouseId) {
      set({ error: 'No se pudo determinar la bodega del producto' });
      return;
    }

    if (quantity <= 0) {
      set({ error: 'La cantidad debe ser mayor a 0' });
      return;
    }

    // Validar que haya una orden de entrega seleccionada (siempre requerida)
    const { selectedDeliveryOrder, registeredExitsCache, targetOrderItemId } =
      get();
    if (!selectedDeliveryOrderId || !selectedDeliveryOrder) {
      set({ error: 'Debe seleccionar una orden de entrega primero' });
      return;
    }

    const validation = get().validateProductAgainstOrder(
      product.id,
      warehouseId,
      quantity,
      targetOrderItemId
    );
    if (!validation.valid) {
      set({ error: validation.error });
      return;
    }

    const key = compositeKey(product.id, warehouseId);
    const matchingItems = selectedDeliveryOrder.items.filter(
      (item) => item.product_id === product.id && item.warehouse_id === warehouseId
    );
    const totalRequired = matchingItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const sumDbDelivered = matchingItems.reduce(
      (sum, item) => sum + item.db_delivered_quantity,
      0
    );
    const cacheTotal =
      registeredExitsCache[selectedDeliveryOrderId]?.[key] ?? 0;
    const totalDelivered = Math.min(
      Math.max(sumDbDelivered, cacheTotal),
      totalRequired
    );
    const maxCartForKey = Math.max(totalRequired - totalDelivered, 0);

    const existingItem = exitItems.find(
      (item) =>
        item.product.id === product.id && item.warehouseId === warehouseId
    );
    const totalQuantityInExit = (existingItem?.quantity || 0) + quantity;

    if (totalQuantityInExit > maxCartForKey) {
      set({
        error: `No hay suficiente stock. Disponible: ${maxCartForKey}, Intentando sacar: ${totalQuantityInExit}`
      });
      return;
    }

    const availableStock = Math.max(maxCartForKey - totalQuantityInExit, 0);

    // Actualizar progreso con clave compuesta
    if (selectedDeliveryOrderId) {
      const currentProgress = scannedItemsProgress.get(key) || 0;
      const newProgress = new Map(scannedItemsProgress);
      newProgress.set(key, currentProgress + quantity);
      set({ scannedItemsProgress: newProgress });
    }

    // Si el producto+bodega ya está en la lista, actualizar cantidad
    if (existingItem) {
      const updatedItems = exitItems.map((item) =>
        item.product.id === product.id && item.warehouseId === warehouseId
          ? { ...item, quantity: item.quantity + quantity, availableStock }
          : item
      );
      set({ exitItems: updatedItems, error: null });
    } else {
      // Agregar nuevo producto con su bodega
      set({
        exitItems: [
          ...exitItems,
          { product, quantity, barcode, availableStock, warehouseId }
        ],
        error: null
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

    // Si hay una orden de entrega seleccionada, actualizar progreso con clave compuesta
    if (
      selectedDeliveryOrderId &&
      itemToRemove.product.id &&
      itemToRemove.warehouseId
    ) {
      const key = compositeKey(
        itemToRemove.product.id,
        itemToRemove.warehouseId
      );
      const currentProgress = scannedItemsProgress.get(key) || 0;
      const newProgress = new Map(scannedItemsProgress);
      const newValue = Math.max(0, currentProgress - itemToRemove.quantity);

      if (newValue > 0) {
        newProgress.set(key, newValue);
      } else {
        newProgress.delete(key);
      }

      set({ exitItems: updatedItems, scannedItemsProgress: newProgress });
    } else {
      set({ exitItems: updatedItems });
    }
  },

  updateProductQuantity: (index: number, quantity: number) => {
    const { exitItems, selectedDeliveryOrderId, scannedItemsProgress } = get();

    if (quantity <= 0) {
      return;
    }

    const item = exitItems[index];
    if (!item) return;

    // Verificar que no exceda el stock disponible
    if (quantity > (item.availableStock || 0)) {
      set({
        error: `La cantidad no puede exceder el stock disponible: ${item.availableStock || 0}`
      });
      return;
    }

    const updatedItems = exitItems.map((item, i) =>
      i === index ? { ...item, quantity } : item
    );

    // Si hay una orden de entrega seleccionada, actualizar progreso con clave compuesta
    if (selectedDeliveryOrderId && item.product.id && item.warehouseId) {
      const key = compositeKey(item.product.id, item.warehouseId);
      const currentProgress = scannedItemsProgress.get(key) || 0;
      const quantityDelta = quantity - item.quantity;
      const newProgress = new Map(scannedItemsProgress);
      const newValue = Math.max(0, currentProgress + quantityDelta);

      if (newValue > 0) {
        newProgress.set(key, newValue);
      } else {
        newProgress.delete(key);
      }

      set({
        exitItems: updatedItems,
        scannedItemsProgress: newProgress,
        error: null
      });
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
      exitMode,
      selectedUserId,
      selectedCustomerId,
      selectedDeliveryOrderId,
      deliveryObservations,
      canRegisterExit,
      authorizationMessage
    } = get();

    if (exitItems.length === 0) {
      return { error: { message: 'No hay productos para registrar' } };
    }

    if (!exitMode) {
      return { error: { message: 'Debe seleccionar un modo de salida' } };
    }

    if (selectedDeliveryOrderId && !canRegisterExit) {
      return {
        error: { message: authorizationMessage || UNAUTHORIZED_EXIT_MESSAGE }
      };
    }

    // Verificar que todos los items tengan warehouseId (resuelto desde la orden)
    const itemsWithoutWarehouse = exitItems.filter((item) => !item.warehouseId);
    if (itemsWithoutWarehouse.length > 0) {
      return {
        error: {
          message:
            'Algunos productos no tienen bodega asignada. Por favor, vuelva a escanearlos.'
        }
      };
    }

    // Establecer loading al inicio del proceso
    set({ loading: true, loadingMessage: 'Registrando salida...' });

    try {
      if (selectedDeliveryOrderId) {
        const authorizationResult =
          await get().validateCurrentUserAuthorizationForOrder(
            selectedDeliveryOrderId
          );

        if (!authorizationResult.canRegister) {
          set({
            loading: false,
            loadingMessage: null,
            canRegisterExit: false,
            authorizationMessage:
              authorizationResult.message || UNAUTHORIZED_EXIT_MESSAGE
          });
          return {
            error: {
              message: authorizationResult.message || UNAUTHORIZED_EXIT_MESSAGE
            }
          };
        }

        set({ canRegisterExit: true, authorizationMessage: null });
      }

      // Preparar datos según el modo de salida (cada item usa su propia bodega)
      const exits: InventoryExit[] = exitItems.map((item) => {
        const baseExit: InventoryExit = {
          product_id: item.product.id,
          quantity: item.quantity,
          warehouse_id: item.warehouseId!, // Per-item desde la orden de entrega
          barcode_scanned: item.barcode,
          created_by: userId
        };

        // Agregar destinatario según el modo
        if (exitMode === 'direct_user') {
          baseExit.delivered_to_user_id = selectedUserId;
          if (selectedDeliveryOrderId) {
            baseExit.delivery_order_id = selectedDeliveryOrderId;
          }
        } else if (exitMode === 'direct_customer') {
          baseExit.delivered_to_customer_id = selectedCustomerId;
          if (selectedDeliveryOrderId) {
            baseExit.delivery_order_id = selectedDeliveryOrderId;
          }
        }

        // Observaciones de entrega opcionales
        if (deliveryObservations && deliveryObservations.trim()) {
          (baseExit as any).delivery_observations = deliveryObservations.trim();
        }

        return baseExit;
      });

      // Insertar salidas
      set({ loadingMessage: 'Guardando productos en el inventario...' });

      const { data: insertedExits, error: exitsError } = await supabase
        .from('inventory_exits')
        .insert(exits)
        .select();

      if (exitsError) {
        const backendDeniedMessage =
          exitsError.message?.toLowerCase().includes('autorizado') ||
          exitsError.message?.toLowerCase().includes('authorized')
            ? UNAUTHORIZED_EXIT_MESSAGE
            : null;

        if (backendDeniedMessage) {
          set({
            canRegisterExit: false,
            authorizationMessage: backendDeniedMessage
          });
        }

        console.error('Error inserting exits:', exitsError);
        logOperationError({
          error_code: 'EXIT_INSERT_FAILED',
          error_message: exitsError.message || String(exitsError),
          module: 'exits',
          operation: 'finalize_exit',
          step: 'insert_records',
          entity_type: selectedDeliveryOrderId ? 'delivery_order' : undefined,
          entity_id: selectedDeliveryOrderId || undefined,
          context: {
            productIds: exitItems.map((i) => i.product.id),
            quantities: exitItems.map((i) => i.quantity),
            warehouseIds: exitItems.map((i) => i.warehouseId),
            exitMode,
            deliveryOrderId: selectedDeliveryOrderId
          }
        });
        return {
          error: {
            ...exitsError,
            message: backendDeniedMessage || exitsError.message
          }
        };
      }

      // Verificar que se insertaron correctamente
      if (!insertedExits || insertedExits.length === 0) {
        console.error('No se insertaron las salidas correctamente');
        return {
          error: {
            message:
              'Error al registrar las salidas. No se insertaron registros.'
          }
        };
      }

      if (insertedExits.length !== exits.length) {
        console.warn(
          `Se insertaron ${insertedExits.length} de ${exits.length} salidas`
        );
      }

      // delivered_quantity y estado de la orden se actualizan en BD (trigger tras INSERT).
      // Refrescar caché local desde inventory_exits + delivery_order_items.
      if (selectedDeliveryOrderId) {
        set({ loadingMessage: 'Sincronizando orden...' });

        const orderIdToRefresh = selectedDeliveryOrderId;
        const { registeredExitsCache } = get();
        const finalCache = { ...registeredExitsCache };
        if (!finalCache[orderIdToRefresh]) {
          finalCache[orderIdToRefresh] = {};
        }

        let orderCompleted = false;

        try {
          const { data: cancelledExits } = await supabase
            .from('inventory_exit_cancellations')
            .select('inventory_exit_id');

          const cancelledExitIds = new Set(
            (cancelledExits || []).map((c: any) => c.inventory_exit_id)
          );

          const { data: exitsData, error: exitsRefreshError } = await supabase
            .from('inventory_exits')
            .select('id, product_id, warehouse_id, quantity')
            .eq('delivery_order_id', orderIdToRefresh);

          if (!exitsRefreshError && exitsData) {
            const registeredByProduct: Record<string, number> = {};
            exitsData.forEach((exit: any) => {
              if (cancelledExitIds.has(exit.id)) return;
              if (!exit.product_id || !exit.warehouse_id) return;
              const key = compositeKey(exit.product_id, exit.warehouse_id);
              registeredByProduct[key] =
                (registeredByProduct[key] || 0) + (exit.quantity || 0);
            });

            const { data: orderData } = await supabase
              .from('delivery_orders')
              .select(
                `
                items:delivery_order_items!inner(
                  id,
                  product_id,
                  warehouse_id,
                  quantity,
                  delivered_quantity,
                  created_at,
                  deleted_at
                )
              `
              )
              .eq('id', orderIdToRefresh)
              .is('items.deleted_at', null)
              .single();

            if (orderData?.items) {
              const fifoInputs = orderData.items.map((item: any) => ({
                id: item.id,
                product_id: item.product_id,
                warehouse_id: item.warehouse_id,
                quantity: Number(item.quantity) || 0,
                db_delivered_quantity: Number(item.delivered_quantity) || 0,
                created_at:
                  item.created_at || '1970-01-01T00:00:00.000Z'
              }));
              const registeredTotalsForOrder = buildRegisteredTotalsByKey(
                fifoInputs,
                registeredByProduct
              );

              finalCache[orderIdToRefresh] = { ...registeredTotalsForOrder };
              Object.keys(finalCache[orderIdToRefresh]).forEach((k) => {
                if (finalCache[orderIdToRefresh][k] <= 0) {
                  delete finalCache[orderIdToRefresh][k];
                }
              });

              Object.entries(finalCache[orderIdToRefresh]).forEach(
                ([cacheKey, total]) => {
                  console.log(
                    `[finalizeExit] ${cacheKey}: Refreshed cache aggregate=${total}`
                  );
                }
              );

              orderCompleted =
                orderData.items.length > 0 &&
                orderData.items.every(
                  (item: any) =>
                    (item.delivered_quantity || 0) >= (item.quantity || 0)
                );
            }

            set({ registeredExitsCache: finalCache });
          }
        } catch (refreshError: any) {
          console.error(
            'Error refreshing delivery order cache from inventory_exits:',
            refreshError
          );
          logOperationError({
            error_code: 'EXIT_CACHE_REFRESH_FAILED',
            error_message: refreshError?.message || String(refreshError),
            module: 'exits',
            operation: 'finalize_exit',
            step: 'cache_refresh',
            severity: 'warning',
            entity_type: 'delivery_order',
            entity_id: orderIdToRefresh,
            context: {
              exitMode,
              deliveryOrderId: orderIdToRefresh
            }
          });
        }

        if (orderCompleted) {
          set({ loadingMessage: 'Actualizando estado de la orden...' });
          await get().selectDeliveryOrder(orderIdToRefresh);
        }
      }

      // Resetear todo después de finalizar
      get().reset();

      // Limpiar loading después de finalizar exitosamente
      set({ loading: false, loadingMessage: null });
      return { error: null };
    } catch (error: any) {
      console.error('Error finalizing exit:', error);
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
      targetOrderItemId: null,
      step: 'setup',
      error: null,
      loading: false,
      customersLoading: false,
      loadingMessage: null,
      exitMode: null,
      selectedUserId: null,
      selectedCustomerId: null,
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      scannedItemsProgress: new Map(),
      canRegisterExit: true,
      authorizationMessage: null,
      // registeredExitsCache se mantiene - NO resetear
      customerSearchTerm: '',
      deliveryObservations: ''
    });
  },

  // Reset all state including cache - for navigation cleanup
  resetAll: () => {
    set({
      warehouseId: null,
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      targetOrderItemId: null,
      step: 'setup',
      error: null,
      loading: false,
      customersLoading: false,
      loadingMessage: null,
      exitMode: null,
      selectedUserId: null,
      selectedCustomerId: null,
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      scannedItemsProgress: new Map(),
      registeredExitsCache: {},
      canRegisterExit: true,
      authorizationMessage: null,
      customerSearchTerm: '',
      deliveryObservations: ''
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
      targetOrderItemId: null
    });
  },

  goBackToSetup: () => {
    set({
      step: 'setup',
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      targetOrderItemId: null,
      error: null,
      exitItems: [], // Limpiar items de salida
      scannedItemsProgress: new Map(), // Limpiar progreso de escaneo
      canRegisterExit: true,
      authorizationMessage: null
    });
  }
}));
