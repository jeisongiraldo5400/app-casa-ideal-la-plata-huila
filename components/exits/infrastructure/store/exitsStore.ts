import {
  buildRegisteredTotalsByKey,
  computeFifoProgressByItemId,
  sortLinesFifo
} from '@/components/exits/infrastructure/utils/fifoDeliveryAllocation';
import { compositeKey } from '@/components/exits/infrastructure/utils/compositeKey';
import { computeKeyAllowance } from '@/components/exits/infrastructure/utils/orderAllowance';
import {
  EPOCH_ISO,
  aggregateExitsByKey,
  fetchDeliveredTotalsByOrder,
  fetchInventoryExitsForOrders,
  fetchPendingCustomerOrders,
  fetchSelectableDeliveryOrderItems,
  fetchUserOrdersExpanded,
  getActiveCancelledExitIds,
  groupExitsByOrder,
  loadOrderRegisteredTotals,
} from '@/components/exits/infrastructure/services/deliveryOrderQueries';
import {
  UNAUTHORIZED_EXIT_MESSAGE,
  checkExitAuthorization,
  type ExitAuthorizationResult,
} from '@/components/exits/infrastructure/services/exitAuthorization';
import {
  fetchActiveProfiles,
  fetchWarehouseStock,
  searchCustomersByTerm,
} from '@/components/exits/infrastructure/services/exitsService';
import { errorMessage } from '@/lib/errorMessage';
import { logOperationError } from '@/lib/operationLogger';
import { createIdempotencyKey } from '@/lib/idempotency';
import { supabase } from '@/lib/supabase';
import { Database, type Json } from '@/types/database.types';
import { create } from 'zustand';

/** Invalidates in-flight customer searches when a newer query starts or clears. */
let customerSearchGeneration = 0;

/**
 * Bumped whenever the exit session changes (reset, destino, orden, salir de la pantalla).
 * Every async action captures it at start and discards its result if it no longer matches,
 * so a late response never writes into a session the operator already abandoned.
 */
let sessionGeneration = 0;

/** requestFingerprint -> idempotency key, reused while the same request is retried. */
const pendingExitRequests = new Map<string, string>();

function invalidateSession(): void {
  sessionGeneration += 1;
  pendingExitRequests.clear();
}

type Product = Database['public']['Tables']['products']['Row'];
type Customer = Database['public']['Tables']['customers']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export type ExitMode = 'direct_user' | 'direct_customer';
export type ExitStep = 'setup' | 'scanning';

export type ExitActionResult =
  | { ok: true; error: null }
  | { ok: false; error: string };

export type FinalizeExitSummary = {
  orderNumber: string;
  recipientName: string;
  productCount: number;
  totalUnits: number;
  orderCompleted: boolean;
};

export type ExitFailure = { message: string; code?: string; details?: string; hint?: string };

export type FinalizeExitResult =
  | { ok: true; error: null; summary: FinalizeExitSummary }
  | { ok: false; error: ExitFailure; summary: null };

export interface ExitItem {
  product: Product;
  quantity: number;
  barcode: string;
  /** Unidades que aún se pueden agregar para este producto+bodega. */
  availableStock?: number;
  warehouseId?: string; // Para órdenes de entrega con múltiples bodegas
  /** Stock físico en la bodega al escanear; null si no se pudo consultar. */
  physicalStock?: number | null;
}

/** Bodega candidata cuando el producto escaneado tiene pendientes en más de una bodega. */
export interface ScanWarehouseCandidate {
  warehouseId: string;
  warehouseName: string;
  pending: number;
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
  order_type?: string | null;
  assigned_to_user_name?: string | null;
  total_items?: number;
  total_quantity?: number;
  delivered_quantity?: number;
  is_from_remission?: boolean;
  remission_id?: string | null;
}

export type DeliveryOrderHeader = Partial<Omit<DeliveryOrder, 'id' | 'items'>> & {
  id: string;
};

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

const NETWORK_SCAN_ERROR =
  'No fue posible consultar el producto. Revisa tu conexión e intenta de nuevo.';

export interface ExitsState {
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
  /** Stock físico en la bodega resuelta; null cuando no se pudo consultar. */
  currentPhysicalStock: number | null;
  /** Línea de orden objetivo al escanear (p. ej. segunda fila mismo SKU). */
  targetOrderItemId: string | null;
  /** Bodegas con pendientes para el producto escaneado; >1 exige elección del operario. */
  warehouseCandidates: ScanWarehouseCandidate[];

  // Estado de UI
  loading: boolean;
  /** true solo mientras register_inventory_exits_batch está en vuelo (único caso de modal bloqueante). */
  finalizing: boolean;
  customersLoading: boolean;
  loadingMessage: string | null;
  error: string | null;
  usersError: string | null;
  /**
   * Resultado de un finalize que terminó después de que la pantalla se reseteó
   * (el operario cambió de pestaña). Se muestra al volver; dismissLastFinalizeResult() lo descarta.
   */
  lastFinalizeResult: FinalizeExitResult | null;
  step: ExitStep;

  // Datos para formularios
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
  /** Orden cuya autorización ya se verificó en esta sesión (evita repetir 4 consultas al finalizar). */
  authorizationCheckedOrderId: string | null;

  // Cache de salidas registradas por orden y producto+bodega (para evitar consultas redundantes)
  registeredExitsCache: Record<string, Record<string, number>>; // orderId -> compositeKey(product_id, warehouse_id) -> quantity

  // Actions - Setup
  setExitMode: (mode: ExitMode | null) => void;
  setSelectedUser: (userId: string | null) => void;
  setSelectedCustomer: (customerId: string | null) => void;
  setDeliveryObservations: (observations: string) => void;
  loadUsers: () => Promise<void>;
  searchCustomers: (searchTerm: string) => Promise<void>;
  openExitConfirmation: () => boolean;
  startExit: () => void;

  // Actions - Delivery Orders
  searchDeliveryOrdersByCustomer: (customerId: string) => Promise<void>;
  searchDeliveryOrdersByUser: (userId: string) => Promise<void>;
  selectDeliveryOrder: (
    orderId: string,
    authorizedHeader?: DeliveryOrderHeader
  ) => Promise<void>;
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
  /** Fija la bodega del producto escaneado (cuando hay varias candidatas) y consulta su stock físico. */
  selectScanWarehouse: (warehouseId: string) => Promise<void>;
  /** Lanza si la consulta falla (red/servidor); devuelve null solo si el código no existe. */
  searchProductByBarcode: (barcode: string) => Promise<Product | null>;
  addProductToExit: (
    product: Product,
    quantity: number,
    barcode: string
  ) => Promise<ExitActionResult>;
  removeProductFromExit: (index: number) => void;
  /** Deshacer un "quitar": reinserta el producto en su posición si la orden aún lo permite. */
  restoreExitItem: (item: ExitItem, index: number) => ExitActionResult;
  updateProductQuantity: (index: number, quantity: number) => void;
  setQuantity: (quantity: number) => void;

  // Actions - Finalize
  finalizeExit: () => Promise<FinalizeExitResult>;
  dismissLastFinalizeResult: () => void;

  // Actions - Reset
  reset: () => void;
  resetAll: () => void;
  /** "Registrar otra salida": limpia la sesión de escaneo conservando destino y orden. */
  startNewSession: () => void;
  clearError: () => void;
  resetCurrentScan: () => void;
  changeDeliveryOrder: () => void;
  goBackToSetup: () => void;
}

function getExitSetupError(state: ExitsState): string | null {
  if (!state.exitMode) {
    return 'Debe seleccionar un modo de salida';
  }

  if (state.exitMode === 'direct_user' && !state.selectedUserId) {
    return 'Debe seleccionar un usuario destinatario';
  }

  if (state.exitMode === 'direct_customer' && !state.selectedCustomerId) {
    return 'Debe seleccionar un cliente destinatario';
  }

  if (!state.canRegisterExit) {
    return state.authorizationMessage || UNAUTHORIZED_EXIT_MESSAGE;
  }

  if (!state.selectedDeliveryOrderId || !state.selectedDeliveryOrder) {
    return state.exitMode === 'direct_user'
      ? 'Debe seleccionar una remisión'
      : 'Debe seleccionar una orden de entrega';
  }

  const progress = state.getSelectedDeliveryOrderProgress();
  if (progress?.items.length && progress.items.every((item) => item.isComplete)) {
    return state.exitMode === 'direct_user'
      ? 'Esta remisión ya está completa. No se pueden registrar más productos.'
      : 'Esta orden de entrega ya está completa. No se pueden registrar más productos.';
  }

  return null;
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
  currentPhysicalStock: null,
  targetOrderItemId: null,
  warehouseCandidates: [],

  // UI
  loading: false,
  finalizing: false,
  customersLoading: false,
  loadingMessage: null,
  error: null,
  usersError: null,
  lastFinalizeResult: null,
  step: 'setup',

  // Datos
  users: [],
  customers: [],
  customerSearchTerm: '',
  deliveryOrders: [],
  selectedDeliveryOrder: null,
  scannedItemsProgress: new Map(),
  canRegisterExit: true,
  authorizationMessage: null,
  authorizationCheckedOrderId: null,
  registeredExitsCache: {},
  deliveryObservations: '',

  // Setup actions
  setExitMode: (mode) => {
    invalidateSession();
    set({
      loading: false,
      loadingMessage: null,
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
      authorizationMessage: null,
      authorizationCheckedOrderId: null,
      deliveryObservations: ''
    });
  },

  setSelectedUser: (userId) => {
    invalidateSession();
    set({
      loading: false,
      loadingMessage: null,
      selectedUserId: userId,
      // Reset delivery order when user changes
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      canRegisterExit: true,
      authorizationMessage: null,
      authorizationCheckedOrderId: null,
      deliveryObservations: ''
    });
  },

  setSelectedCustomer: (customerId) => {
    invalidateSession();
    set({
      loading: false,
      loadingMessage: null,
      selectedCustomerId: customerId,
      // Reset delivery order when customer changes
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryOrders: [],
      canRegisterExit: true,
      authorizationMessage: null,
      authorizationCheckedOrderId: null,
      deliveryObservations: ''
    });
  },

  validateCurrentUserAuthorizationForOrder: (orderId: string): Promise<ExitAuthorizationResult> =>
    checkExitAuthorization(orderId),

  setDeliveryObservations: (observations) => {
    set({ deliveryObservations: observations });
  },

  loadUsers: async () => {
    set({ usersError: null });
    try {
      const data = await fetchActiveProfiles();
      set({ users: data, usersError: null });
    } catch (error: unknown) {
      console.error('Error loading users:', error);
      set({
        users: [],
        usersError: 'No fue posible cargar los usuarios. Revisa tu conexión e intenta de nuevo.'
      });
    }
  },

  searchCustomers: async (searchTerm: string) => {
    const normalizedSearchTerm = searchTerm.trim();
    const generation = ++customerSearchGeneration;

    if (!normalizedSearchTerm) {
      set({ customerSearchTerm: '', customers: [], customersLoading: false });
      return;
    }

    set({ customerSearchTerm: normalizedSearchTerm, customersLoading: true });

    try {
      const data = await searchCustomersByTerm(normalizedSearchTerm);
      if (generation !== customerSearchGeneration) {
        return;
      }
      set({ customers: data, customersLoading: false });
    } catch (error: unknown) {
      if (generation !== customerSearchGeneration) {
        return;
      }
      console.error('Error searching customers:', error);
      set({ customers: [], customersLoading: false });
    }
  },

  searchDeliveryOrdersByCustomer: async (customerId: string) => {
    const generation = sessionGeneration;
    const isStale = () => generation !== sessionGeneration;
    set({ loading: true, loadingMessage: 'Cargando órdenes de entrega...' });

    try {
      const orders = await fetchPendingCustomerOrders(customerId);
      if (isStale()) return;
      if (orders.length === 0) {
        set({ deliveryOrders: [], loading: false, loadingMessage: null });
        return;
      }

      const exits = await fetchInventoryExitsForOrders(orders.map((order) => order.id));
      const cancelledExitIds = await getActiveCancelledExitIds(exits.map((exit) => exit.id));
      if (isStale()) return;
      const exitsByOrder = groupExitsByOrder(exits, cancelledExitIds);
      const customerName = get().customers.find((customer) => customer.id === customerId)?.name || '';

      // Reconciliar BD con inventory_exits y quedarse solo con las órdenes incompletas.
      const ordersWithCounts: DeliveryOrder[] = orders.map((order) => {
        const activeItems = order.items.filter((item) => !item.deleted_at && item.product && !item.product.deleted_at);
        const orderExits = exitsByOrder.get(order.id) || new Map<string, number>();
        let totalDelivered = 0;
        const totalQuantity = activeItems.reduce((sum, item) => {
          const key = compositeKey(item.product_id, item.warehouse_id);
          const bestEstimate = Math.max(orderExits.get(key) || 0, item.delivered_quantity || 0);
          totalDelivered += Math.min(bestEstimate, item.quantity);
          return sum + item.quantity;
        }, 0);
        return {
          id: order.id,
          order_number: order.order_number,
          customer_id: order.customer_id || customerId,
          customer_name: customerName,
          customer_id_number: '',
          status: order.status,
          delivery_address: order.delivery_address,
          notes: order.notes,
          created_at: order.created_at,
          order_type: order.order_type,
          items: [],
          total_items: activeItems.length,
          total_quantity: totalQuantity,
          delivered_quantity: totalDelivered
        };
      });

      set({
        deliveryOrders: ordersWithCounts.filter(
          (order) => (order.total_quantity || 0) > 0 && (order.delivered_quantity || 0) < (order.total_quantity || 0)
        ),
        loading: false,
        loadingMessage: null
      });
    } catch (error: unknown) {
      console.error('Error loading delivery orders:', error);
      if (isStale()) return;
      set({
        deliveryOrders: [],
        loading: false,
        loadingMessage: null,
        error: errorMessage(error, 'No fue posible cargar las órdenes de entrega')
      });
    }
  },

  searchDeliveryOrdersByUser: async (userId: string) => {
    const generation = sessionGeneration;
    const isStale = () => generation !== sessionGeneration;
    set({ loading: true, loadingMessage: 'Cargando órdenes...' });

    try {
      const orders = await fetchUserOrdersExpanded(userId);
      if (isStale()) return;
      if (orders.length === 0) {
        set({ deliveryOrders: [], loading: false, loadingMessage: null });
        return;
      }

      const orderIds = orders.map((order) => order.id);
      const exits = await fetchInventoryExitsForOrders(orderIds);
      const cancelledExitIds = await getActiveCancelledExitIds(exits.map((exit) => exit.id));
      const dbDeliveredByOrder = await fetchDeliveredTotalsByOrder(orderIds);
      if (isStale()) return;
      const exitsByOrder = groupExitsByOrder(exits, cancelledExitIds);

      const ordersWithProgress: DeliveryOrder[] = orders.map((order) => {
        let totalFromExits = 0;
        (exitsByOrder.get(order.id) || new Map<string, number>()).forEach((quantity) => {
          totalFromExits += quantity;
        });
        const bestEstimate = Math.max(totalFromExits, dbDeliveredByOrder.get(order.id) || 0);
        return {
          id: order.id,
          order_number: order.order_number || null,
          customer_id: order.customer_id || '',
          customer_name: order.customer_name || '',
          customer_id_number: order.customer_id_number || '',
          status: order.status || 'pending',
          delivery_address: order.delivery_address || null,
          notes: order.notes || null,
          created_at: order.created_at,
          items: [],
          order_type: order.order_type,
          assigned_to_user_name: order.assigned_to_user_name,
          total_items: order.total_items,
          total_quantity: order.total_quantity,
          delivered_quantity: Math.min(bestEstimate, order.total_quantity || 0),
          is_from_remission: order.is_from_remission,
          remission_id: order.remission_id
        };
      });

      set({
        deliveryOrders: ordersWithProgress.filter(
          (order) => (order.total_quantity || 0) > 0 && (order.delivered_quantity || 0) < (order.total_quantity || 0)
        ),
        loading: false,
        loadingMessage: null
      });
    } catch (error: unknown) {
      console.error('Error loading orders:', error);
      if (isStale()) return;
      set({
        deliveryOrders: [],
        loading: false,
        loadingMessage: null,
        error: errorMessage(error, 'No fue posible cargar las órdenes')
      });
    }
  },

  selectDeliveryOrder: async (orderId: string, authorizedHeader) => {
    const generation = sessionGeneration;
    const isStale = () => generation !== sessionGeneration;
    const previousOrderId = get().selectedDeliveryOrderId;

    set({ loading: true, loadingMessage: 'Cargando detalles de la orden...', error: null });

    const failSelect = (error: string) =>
      set({
        selectedDeliveryOrder: null,
        selectedDeliveryOrderId: null,
        loading: false,
        loadingMessage: null,
        error
      });

    try {
      // La cabecera viene de la lista que el usuario acaba de cargar: reconsultarla podía
      // devolver cero filas por RLS aunque la orden ya estuviera visible y autorizada.
      const orderHeader: DeliveryOrderHeader | undefined =
        authorizedHeader || get().deliveryOrders.find((order) => order.id === orderId);
      if (!orderHeader) {
        failSelect('Orden de entrega no encontrada');
        return;
      }

      const { data: orderItems, error: itemsError } = await fetchSelectableDeliveryOrderItems(orderHeader.id);
      if (isStale()) return;
      if (itemsError) {
        console.error('Error loading delivery order items:', itemsError);
        failSelect(itemsError.message || 'No fue posible cargar los productos de la orden');
        return;
      }
      if (!orderItems.length) {
        failSelect('La orden no tiene productos disponibles para registrar la salida');
        return;
      }

      const exits = await fetchInventoryExitsForOrders([orderId]);
      const cancelledExitIds = await getActiveCancelledExitIds(exits.map((exit) => exit.id));
      if (isStale()) return;
      const registeredByProduct = aggregateExitsByKey(exits, cancelledExitIds);

      const activeItems = orderItems.filter((item) => !item.deleted_at && item.product && !item.product.deleted_at);
      const fifoInputs = activeItems.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        warehouse_id: item.warehouse_id,
        quantity: Number(item.quantity) || 0,
        db_delivered_quantity: Number(item.delivered_quantity) || 0,
        created_at: item.created_at || EPOCH_ISO
      }));
      const registeredTotalsForOrder = buildRegisteredTotalsByKey(fifoInputs, registeredByProduct);
      const fifoAllocated = computeFifoProgressByItemId(fifoInputs, registeredTotalsForOrder, new Map());

      const deliveryOrder: DeliveryOrder = {
        id: orderHeader.id,
        order_number: orderHeader.order_number || null,
        customer_id: orderHeader.customer_id || '',
        customer_name: orderHeader.customer_name || orderHeader.assigned_to_user_name || '',
        customer_id_number: orderHeader.customer_id_number || '',
        status: orderHeader.status || 'pending',
        delivery_address: orderHeader.delivery_address || '',
        notes: orderHeader.notes || '',
        created_at: orderHeader.created_at || new Date().toISOString(),
        order_type: orderHeader.order_type,
        assigned_to_user_name: orderHeader.assigned_to_user_name,
        is_from_remission: orderHeader.is_from_remission,
        remission_id: orderHeader.remission_id,
        items: activeItems.map((item) => {
          const fp = fifoAllocated.get(item.id) ?? { registered: 0, sessionScanned: 0, pending: Number(item.quantity) || 0 };
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
            db_delivered_quantity: Number(item.delivered_quantity) || 0,
            created_at: item.created_at || EPOCH_ISO
          };
        })
      };

      const authorizationResult = await get().validateCurrentUserAuthorizationForOrder(orderId);
      if (isStale()) return;

      const updatedCache = { ...get().registeredExitsCache, [orderId]: { ...registeredTotalsForOrder } };
      Object.keys(updatedCache[orderId]).forEach((k) => {
        if (updatedCache[orderId][k] <= 0) delete updatedCache[orderId][k];
      });

      set({
        selectedDeliveryOrder: deliveryOrder,
        selectedDeliveryOrderId: orderId,
        scannedItemsProgress: new Map(),
        registeredExitsCache: updatedCache,
        canRegisterExit: authorizationResult.canRegister,
        authorizationMessage: authorizationResult.message,
        authorizationCheckedOrderId: authorizationResult.canRegister ? orderId : null,
        deliveryObservations: previousOrderId !== orderId ? '' : get().deliveryObservations,
        loading: false,
        loadingMessage: null
      });
    } catch (error: unknown) {
      console.error('Error loading delivery order details:', error);
      if (isStale()) return;
      set({
        selectedDeliveryOrder: null,
        selectedDeliveryOrderId: null,
        canRegisterExit: true,
        authorizationMessage: null,
        authorizationCheckedOrderId: null,
        loading: false,
        loadingMessage: null,
        error: errorMessage(error, 'No fue posible cargar la orden')
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

    const cacheSlice = registeredExitsCache[selectedDeliveryOrderId] || {};
    const { lines, totalRequired, totalDelivered } = computeKeyAllowance(
      selectedDeliveryOrder,
      cacheSlice,
      productId,
      warehouseId
    );

    if (lines.length === 0) {
      return {
        valid: false,
        error: 'Este producto no está incluido en la orden de entrega para esta bodega'
      };
    }

    const sessionTotal = exitItems
      .filter((item) => item.product.id === productId && item.warehouseId === warehouseId)
      .reduce((sum, item) => sum + item.quantity, 0);

    if (totalDelivered + sessionTotal + quantity > totalRequired) {
      const maxAllowable = Math.max(totalRequired - totalDelivered - sessionTotal, 0);
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

    const orderItem =
      (targetOrderItemId ? lines.find((i) => i.id === targetOrderItemId) : undefined) ||
      sortLinesFifo(lines).find((i) => (fifoProgress.get(i.id)?.pending ?? 0) > 0) ||
      lines[0];

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

  openExitConfirmation: () => {
    const error = getExitSetupError(get());
    if (error) {
      set({ error, step: 'setup' });
      return false;
    }

    // El resumen de la orden vive en el último paso de la configuración; no hay pantalla intermedia.
    set({ error: null });
    return true;
  },

  startExit: () => {
    const error = getExitSetupError(get());
    if (error) {
      set({ error });
      return;
    }

    set({ step: 'scanning', error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string) => {
    const generation = sessionGeneration;
    const isStale = () => generation !== sessionGeneration;

    set({
      loading: true,
      loadingMessage: 'Buscando producto...',
      error: null,
      currentScannedBarcode: barcode,
      warehouseCandidates: [],
      currentPhysicalStock: null
    });

    const failScan = (error: string) =>
      set({
        loading: false,
        loadingMessage: null,
        error,
        currentProduct: null,
        currentScannedBarcode: null,
        targetOrderItemId: null,
        warehouseCandidates: [],
        currentPhysicalStock: null
      });

    try {
      let product: Product | null;
      try {
        product = await get().searchProductByBarcode(barcode);
      } catch (lookupError) {
        console.error('Error searching product:', lookupError);
        if (isStale()) return;
        failScan(NETWORK_SCAN_ERROR);
        return;
      }
      if (isStale()) return;

      if (!product) {
        failScan('Producto no encontrado. Este código de barras no está registrado en el sistema.');
        return;
      }

      const {
        selectedDeliveryOrderId,
        selectedDeliveryOrder,
        registeredExitsCache,
        scannedItemsProgress,
        exitItems
      } = get();

      if (!selectedDeliveryOrderId || !selectedDeliveryOrder) {
        failScan('Debe seleccionar una orden de entrega primero');
        return;
      }

      // Líneas de la orden con pendiente para este producto, agrupadas por bodega.
      // El operario debe elegir la bodega cuando hay más de una: escoger por FIFO
      // descontaría stock de una bodega distinta a la que realmente despacha.
      const cacheSlice = registeredExitsCache[selectedDeliveryOrderId] || {};
      const fifoMap = computeFifoProgressByItemId(
        selectedDeliveryOrder.items,
        cacheSlice,
        scannedItemsProgress
      );
      const pendingByWarehouse = new Map<string, ScanWarehouseCandidate>();
      selectedDeliveryOrder.items.forEach((item) => {
        if (item.product_id !== product.id) return;
        const pending = fifoMap.get(item.id)?.pending ?? 0;
        if (pending <= 0) return;
        const current = pendingByWarehouse.get(item.warehouse_id);
        if (current) {
          current.pending += pending;
        } else {
          pendingByWarehouse.set(item.warehouse_id, {
            warehouseId: item.warehouse_id,
            warehouseName: item.warehouse_name,
            pending
          });
        }
      });
      const candidates = [...pendingByWarehouse.values()];

      if (candidates.length === 0) {
        const existsInOrder = selectedDeliveryOrder.items.some(
          (item) => item.product_id === product.id
        );
        if (!existsInOrder) {
          failScan('Este producto no está incluido en la orden de entrega.');
          return;
        }
        const inSession = exitItems.some((item) => item.product.id === product.id);
        failScan(
          inSession
            ? 'Ya agregaste todas las unidades pendientes de este producto en esta salida.'
            : 'Este producto ya fue entregado completamente en esta orden.'
        );
        return;
      }

      set({
        currentProduct: product,
        currentQuantity: 1,
        warehouseCandidates: candidates,
        warehouseId: null,
        targetOrderItemId: null,
        currentAvailableStock: 0,
        currentPhysicalStock: null,
        error: null
      });

      if (candidates.length === 1) {
        await get().selectScanWarehouse(candidates[0].warehouseId);
        return;
      }

      set({ loading: false, loadingMessage: null });
    } catch (error: unknown) {
      console.error('Error scanning barcode:', error);
      if (isStale()) return;
      failScan(
        error instanceof Error && error.message
          ? error.message
          : 'Error al escanear el código de barras. Por favor intente de nuevo.'
      );
    }
  },

  selectScanWarehouse: async (warehouseId: string) => {
    const generation = sessionGeneration;
    const {
      currentProduct,
      selectedDeliveryOrder,
      selectedDeliveryOrderId,
      registeredExitsCache,
      scannedItemsProgress,
      warehouseCandidates
    } = get();

    if (!currentProduct || !selectedDeliveryOrder || !selectedDeliveryOrderId) {
      set({ loading: false, loadingMessage: null, error: 'No hay un producto escaneado' });
      return;
    }

    const candidate = warehouseCandidates.find((c) => c.warehouseId === warehouseId);
    if (!candidate) {
      set({
        loading: false,
        loadingMessage: null,
        error: 'La bodega elegida no tiene pendientes para este producto'
      });
      return;
    }

    const fifoMap = computeFifoProgressByItemId(
      selectedDeliveryOrder.items,
      registeredExitsCache[selectedDeliveryOrderId] || {},
      scannedItemsProgress
    );
    const targetLine = sortLinesFifo(
      selectedDeliveryOrder.items.filter(
        (item) =>
          item.product_id === currentProduct.id &&
          item.warehouse_id === warehouseId &&
          (fifoMap.get(item.id)?.pending ?? 0) > 0
      )
    )[0];

    set({
      loading: true,
      loadingMessage: 'Consultando stock en bodega...',
      warehouseId,
      targetOrderItemId: targetLine?.id ?? null,
      currentAvailableStock: candidate.pending,
      currentPhysicalStock: null,
      error: null
    });

    let physicalStock: number | null = null;
    try {
      physicalStock = await fetchWarehouseStock(currentProduct.id, warehouseId);
    } catch (stockError: unknown) {
      // Sin stock físico seguimos con el pendiente de la orden; el RPC valida al registrar.
      console.error('Error loading warehouse stock:', stockError);
      logOperationError({
        error_code: 'EXIT_STOCK_LOOKUP_FAILED',
        error_message: stockError instanceof Error ? stockError.message : String(stockError),
        module: 'exits',
        operation: 'scan_barcode',
        step: 'warehouse_stock',
        severity: 'warning',
        entity_type: 'delivery_order',
        entity_id: selectedDeliveryOrderId,
        context: { productId: currentProduct.id, warehouseId }
      });
    }
    if (generation !== sessionGeneration) return;

    set({
      loading: false,
      loadingMessage: null,
      currentPhysicalStock: physicalStock,
      currentQuantity: physicalStock === 0 ? 0 : 1
    });
  },

  searchProductByBarcode: async (barcode: string): Promise<Product | null> => {
    if (!barcode || typeof barcode !== 'string' || barcode.trim() === '') {
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
        return null;
      }
      throw error;
    }

    return (data as Product | null) ?? null;
  },

  addProductToExit: async (
    product: Product,
    quantity: number,
    barcode: string
  ) => {
    const {
      exitItems,
      warehouseId,
      scannedItemsProgress,
      selectedDeliveryOrderId,
      selectedDeliveryOrder,
      registeredExitsCache,
      targetOrderItemId,
      currentPhysicalStock,
      warehouseCandidates
    } = get();

    if (!warehouseId) {
      const error =
        warehouseCandidates.length > 1
          ? 'Elige la bodega de la que sale el producto'
          : 'No se pudo determinar la bodega del producto';
      set({ error });
      return { ok: false, error };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const error = 'La cantidad debe ser un número mayor que cero';
      set({ error });
      return { ok: false, error };
    }

    if (!selectedDeliveryOrderId || !selectedDeliveryOrder) {
      const error = 'Debe seleccionar una orden de entrega primero';
      set({ error });
      return { ok: false, error };
    }

    const validation = get().validateProductAgainstOrder(
      product.id,
      warehouseId,
      quantity,
      targetOrderItemId
    );
    if (!validation.valid) {
      const error = validation.error || 'El producto no es válido para esta orden';
      set({ error });
      return { ok: false, error };
    }

    const existingItem = exitItems.find(
      (item) => item.product.id === product.id && item.warehouseId === warehouseId
    );
    const totalQuantityInExit = (existingItem?.quantity || 0) + quantity;

    // Stock físico: conocido desde el escaneo; si no se pudo consultar, el RPC valida al registrar.
    const physicalStock = existingItem?.physicalStock ?? currentPhysicalStock ?? null;
    if (physicalStock !== null && totalQuantityInExit > physicalStock) {
      const warehouseName =
        selectedDeliveryOrder.items.find((item) => item.warehouse_id === warehouseId)?.warehouse_name ||
        'la bodega';
      const error = `Stock físico insuficiente en ${warehouseName}. Disponible: ${physicalStock}, en esta salida: ${totalQuantityInExit}`;
      set({ error });
      return { ok: false, error };
    }

    const { maxCart } = computeKeyAllowance(
      selectedDeliveryOrder,
      registeredExitsCache[selectedDeliveryOrderId] || {},
      product.id,
      warehouseId
    );
    const cap = physicalStock !== null ? Math.min(maxCart, physicalStock) : maxCart;
    const availableStock = Math.max(cap - totalQuantityInExit, 0);

    const key = compositeKey(product.id, warehouseId);
    const newProgress = new Map(scannedItemsProgress);
    newProgress.set(key, (scannedItemsProgress.get(key) || 0) + quantity);

    const updatedItems = existingItem
      ? exitItems.map((item) =>
          item.product.id === product.id && item.warehouseId === warehouseId
            ? { ...item, quantity: item.quantity + quantity, availableStock, physicalStock }
            : item
        )
      : [...exitItems, { product, quantity, barcode, availableStock, warehouseId, physicalStock }];

    set({ exitItems: updatedItems, scannedItemsProgress: newProgress, error: null });
    get().resetCurrentScan();
    return { ok: true, error: null };
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

  restoreExitItem: (item, index) => {
    const { exitItems, selectedDeliveryOrder, selectedDeliveryOrderId, registeredExitsCache, scannedItemsProgress } = get();
    if (!selectedDeliveryOrder || !selectedDeliveryOrderId || !item.warehouseId) {
      return { ok: false, error: 'No fue posible restaurar el producto' };
    }
    if (exitItems.some((existing) => existing.product.id === item.product.id && existing.warehouseId === item.warehouseId)) {
      return { ok: false, error: 'El producto ya está de nuevo en la salida' };
    }
    const validation = get().validateProductAgainstOrder(item.product.id, item.warehouseId, item.quantity);
    if (!validation.valid) {
      return { ok: false, error: validation.error || 'La orden ya no permite esta cantidad' };
    }
    const { maxCart } = computeKeyAllowance(
      selectedDeliveryOrder,
      registeredExitsCache[selectedDeliveryOrderId] || {},
      item.product.id,
      item.warehouseId
    );
    const cap = item.physicalStock != null ? Math.min(maxCart, item.physicalStock) : maxCart;
    const key = compositeKey(item.product.id, item.warehouseId);
    const newProgress = new Map(scannedItemsProgress);
    newProgress.set(key, (scannedItemsProgress.get(key) || 0) + item.quantity);
    const restored = { ...item, availableStock: Math.max(cap - item.quantity, 0) };
    const next = [...exitItems];
    next.splice(Math.min(Math.max(index, 0), next.length), 0, restored);
    set({ exitItems: next, scannedItemsProgress: newProgress, error: null });
    return { ok: true, error: null };
  },

  updateProductQuantity: (index: number, quantity: number) => {
    const {
      exitItems,
      selectedDeliveryOrder,
      selectedDeliveryOrderId,
      registeredExitsCache,
      scannedItemsProgress
    } = get();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      set({ error: 'La cantidad debe ser un número mayor que cero' });
      return;
    }

    const item = exitItems[index];
    if (!item) return;

    if (!selectedDeliveryOrderId || !selectedDeliveryOrder || !item.warehouseId) {
      set({ error: 'Debe seleccionar una orden de entrega válida' });
      return;
    }

    const { maxCart } = computeKeyAllowance(
      selectedDeliveryOrder,
      registeredExitsCache[selectedDeliveryOrderId] || {},
      item.product.id,
      item.warehouseId
    );

    if (quantity > maxCart) {
      set({ error: `La cantidad no puede exceder lo pendiente en la orden: ${maxCart}` });
      return;
    }

    if (item.physicalStock != null && quantity > item.physicalStock) {
      set({ error: `Stock físico insuficiente. Disponible en bodega: ${item.physicalStock}` });
      return;
    }

    const cap = item.physicalStock != null ? Math.min(maxCart, item.physicalStock) : maxCart;
    const key = compositeKey(item.product.id, item.warehouseId);
    const newProgress = new Map(scannedItemsProgress);
    const newValue = Math.max(0, (scannedItemsProgress.get(key) || 0) + (quantity - item.quantity));
    if (newValue > 0) {
      newProgress.set(key, newValue);
    } else {
      newProgress.delete(key);
    }

    set({
      exitItems: exitItems.map((current, i) =>
        i === index ? { ...current, quantity, availableStock: Math.max(cap - quantity, 0) } : current
      ),
      scannedItemsProgress: newProgress,
      error: null
    });
  },

  setQuantity: (quantity: number) => {
    set({ currentQuantity: quantity });
  },

  // Finalize exit
  finalizeExit: async (): Promise<FinalizeExitResult> => {
    const failure = (error: ExitFailure): FinalizeExitResult => ({ ok: false, error, summary: null });
    const generation = sessionGeneration;
    const isStale = () => generation !== sessionGeneration;

    if (get().loading) {
      console.warn('[finalizeExit] Ya se está procesando una salida, ignorando llamada duplicada');
      return failure({ message: 'Ya se está procesando esta salida' });
    }

    const {
      exitItems,
      exitMode,
      selectedUserId,
      selectedCustomerId,
      selectedDeliveryOrderId,
      selectedDeliveryOrder,
      deliveryObservations,
      canRegisterExit,
      authorizationMessage,
      authorizationCheckedOrderId
    } = get();

    if (exitItems.length === 0) {
      return failure({ message: 'No hay productos para registrar' });
    }

    if (!exitMode) {
      return failure({ message: 'Debe seleccionar un modo de salida' });
    }

    if (exitMode === 'direct_user' && !selectedUserId) {
      return failure({ message: 'Debe seleccionar un usuario destinatario' });
    }

    if (exitMode === 'direct_customer' && !selectedCustomerId) {
      return failure({ message: 'Debe seleccionar un cliente destinatario' });
    }

    if (!selectedDeliveryOrderId) {
      return failure({ message: 'Debe seleccionar una orden de entrega' });
    }

    if (exitItems.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      return failure({ message: 'Todas las cantidades deben ser números mayores que cero' });
    }

    if (!canRegisterExit) {
      return failure({ message: authorizationMessage || UNAUTHORIZED_EXIT_MESSAGE });
    }

    if (exitItems.some((item) => !item.warehouseId)) {
      return failure({
        message: 'Algunos productos no tienen bodega asignada. Por favor, vuelva a escanearlos.'
      });
    }

    const successSummary: FinalizeExitSummary = {
      orderNumber: selectedDeliveryOrder?.order_number || selectedDeliveryOrderId.slice(0, 8),
      recipientName:
        selectedDeliveryOrder?.customer_name ||
        selectedDeliveryOrder?.assigned_to_user_name ||
        'Destinatario',
      productCount: exitItems.length,
      totalUnits: exitItems.reduce((sum, item) => sum + item.quantity, 0),
      orderCompleted: false
    };

    set({ loading: true, finalizing: true, loadingMessage: 'Registrando salida...' });

    try {
      // La autorización se verificó al seleccionar la orden; el RPC la vuelve a exigir en BD.
      if (authorizationCheckedOrderId !== selectedDeliveryOrderId) {
        set({ loadingMessage: 'Verificando autorización...' });
        const authorizationResult =
          await get().validateCurrentUserAuthorizationForOrder(selectedDeliveryOrderId);
        if (isStale()) {
          return failure({ message: 'La sesión de salida se reinició antes de registrar' });
        }

        if (!authorizationResult.canRegister) {
          set({
            loading: false,
            finalizing: false,
            loadingMessage: null,
            canRegisterExit: false,
            authorizationMessage: authorizationResult.message || UNAUTHORIZED_EXIT_MESSAGE
          });
          return failure({ message: authorizationResult.message || UNAUTHORIZED_EXIT_MESSAGE });
        }

        set({
          canRegisterExit: true,
          authorizationMessage: null,
          authorizationCheckedOrderId: selectedDeliveryOrderId
        });
      }

      const requestFingerprint = JSON.stringify({
        exitMode,
        selectedUserId,
        selectedCustomerId,
        selectedDeliveryOrderId,
        deliveryObservations: deliveryObservations.trim(),
        exitItems: exitItems.map((item) => ({
          productId: item.product.id,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          barcode: item.barcode
        }))
      });
      let idempotencyKey = pendingExitRequests.get(requestFingerprint);
      if (!idempotencyKey) {
        idempotencyKey = createIdempotencyKey();
        pendingExitRequests.set(requestFingerprint, idempotencyKey);
      }

      set({ loadingMessage: 'Guardando productos en el inventario...' });
      const { data: exitResult, error: exitsError } = await supabase.rpc(
        'register_inventory_exits_batch',
        {
          p_exit_mode: exitMode,
          p_delivered_to_user_id: exitMode === 'direct_user' ? selectedUserId : null,
          p_delivered_to_customer_id: exitMode === 'direct_customer' ? selectedCustomerId : null,
          p_delivery_order_id: selectedDeliveryOrderId,
          p_delivery_observations: deliveryObservations.trim() || null,
          p_items: exitItems.map((item) => ({
            product_id: item.product.id,
            warehouse_id: item.warehouseId,
            quantity: item.quantity,
            barcode_scanned: item.barcode
          })) as unknown as Json,
          p_idempotency_key: idempotencyKey
        }
      );

      if (exitsError) {
        const backendDeniedMessage =
          exitsError.message?.toLowerCase().includes('autorizado') ||
          exitsError.message?.toLowerCase().includes('authorized')
            ? UNAUTHORIZED_EXIT_MESSAGE
            : null;

        console.error('Error inserting exits:', exitsError);
        logOperationError({
          error_code: 'EXIT_INSERT_FAILED',
          error_message: exitsError.message || String(exitsError),
          module: 'exits',
          operation: 'finalize_exit',
          step: 'insert_records',
          entity_type: 'delivery_order',
          entity_id: selectedDeliveryOrderId,
          context: {
            productIds: exitItems.map((i) => i.product.id),
            quantities: exitItems.map((i) => i.quantity),
            warehouseIds: exitItems.map((i) => i.warehouseId),
            exitMode,
            deliveryOrderId: selectedDeliveryOrderId
          }
        });
        if (!isStale()) {
          set({
            loading: false,
            finalizing: false,
            loadingMessage: null,
            ...(backendDeniedMessage
              ? { canRegisterExit: false, authorizationMessage: backendDeniedMessage }
              : {})
          });
        }
        return failure({
          message: backendDeniedMessage || exitsError.message,
          code: exitsError.code,
          details: exitsError.details,
          hint: exitsError.hint
        });
      }

      const insertedExitIds = (exitResult as { exit_ids?: string[] } | null)?.exit_ids || [];
      if (insertedExitIds.length === 0) {
        console.error('No se insertaron las salidas correctamente');
        if (!isStale()) set({ loading: false, finalizing: false, loadingMessage: null });
        return failure({ message: 'Error al registrar las salidas. No se insertaron registros.' });
      }

      if (insertedExitIds.length !== exitItems.length) {
        console.error(
          `Respuesta inválida: se insertaron ${insertedExitIds.length} de ${exitItems.length} salidas`
        );
        if (!isStale()) set({ loading: false, finalizing: false, loadingMessage: null });
        return failure({
          message: 'La respuesta del registro de salidas está incompleta. Intente nuevamente.'
        });
      }

      // La salida quedó registrada en BD: desde aquí el resultado es éxito aunque el refresco falle.
      pendingExitRequests.delete(requestFingerprint);

      // delivered_quantity y estado de la orden los actualiza un trigger en BD;
      // refrescar la caché local para que la siguiente salida sobre la misma orden valide bien.
      let orderCompleted = false;
      if (!isStale()) set({ loadingMessage: 'Sincronizando orden...' });
      try {
        const refreshed = await loadOrderRegisteredTotals(selectedDeliveryOrderId);
        if (refreshed) {
          orderCompleted = refreshed.completed;
          if (!isStale()) {
            set({
              registeredExitsCache: {
                ...get().registeredExitsCache,
                [selectedDeliveryOrderId]: refreshed.totals
              }
            });
          }
        }
      } catch (refreshError: unknown) {
        console.error('Error refreshing delivery order cache from inventory_exits:', refreshError);
        logOperationError({
          error_code: 'EXIT_CACHE_REFRESH_FAILED',
          error_message: refreshError instanceof Error ? refreshError.message : String(refreshError),
          module: 'exits',
          operation: 'finalize_exit',
          step: 'cache_refresh',
          severity: 'warning',
          entity_type: 'delivery_order',
          entity_id: selectedDeliveryOrderId,
          context: { exitMode, deliveryOrderId: selectedDeliveryOrderId }
        });
      }

      const result: FinalizeExitResult = {
        ok: true,
        error: null,
        summary: { ...successSummary, orderCompleted }
      };
      if (isStale()) {
        // La salida quedó registrada pero la pantalla ya se reinició: avisar al volver.
        set({ lastFinalizeResult: result });
      } else {
        set({ loading: false, finalizing: false, loadingMessage: null });
      }
      return result;
    } catch (error: unknown) {
      console.error('Error finalizing exit:', error);
      const result = failure({ message: error instanceof Error ? error.message : String(error) });
      if (isStale()) {
        set({ lastFinalizeResult: result });
      } else {
        set({ loading: false, finalizing: false, loadingMessage: null });
      }
      return result;
    }
  },

  dismissLastFinalizeResult: () => set({ lastFinalizeResult: null }),

  // Reset actions
  reset: () => {
    invalidateSession();
    // NO resetear registeredExitsCache para mantener los valores actualizados
    // El cache se mantiene para que las validaciones futuras sean correctas
    set({
      warehouseId: null,
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      currentPhysicalStock: null,
      targetOrderItemId: null,
      warehouseCandidates: [],
      step: 'setup',
      error: null,
      loading: false,
      finalizing: false,
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
      authorizationCheckedOrderId: null,
      // registeredExitsCache se mantiene - NO resetear
      customerSearchTerm: '',
      deliveryObservations: ''
    });
  },

  startNewSession: () => {
    invalidateSession();
    set({
      warehouseId: null,
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      currentPhysicalStock: null,
      targetOrderItemId: null,
      warehouseCandidates: [],
      scannedItemsProgress: new Map(),
      deliveryObservations: '',
      step: 'setup',
      error: null,
      loading: false,
      finalizing: false,
      loadingMessage: null
    });
  },

  // Reset all state including cache - for navigation cleanup
  resetAll: () => {
    invalidateSession();
    set({
      warehouseId: null,
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      currentPhysicalStock: null,
      targetOrderItemId: null,
      warehouseCandidates: [],
      step: 'setup',
      error: null,
      loading: false,
      finalizing: false,
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
      authorizationCheckedOrderId: null,
      customerSearchTerm: '',
      deliveryObservations: ''
    });
  },

  clearError: () => {
    set({ error: null });
  },

  resetCurrentScan: () => {
    set({
      warehouseId: null,
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      targetOrderItemId: null
    });
  },

  changeDeliveryOrder: () => {
    invalidateSession();
    set({
      step: 'setup',
      selectedDeliveryOrderId: null,
      selectedDeliveryOrder: null,
      deliveryObservations: '',
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      currentPhysicalStock: null,
      targetOrderItemId: null,
      warehouseCandidates: [],
      exitItems: [],
      scannedItemsProgress: new Map(),
      canRegisterExit: true,
      authorizationMessage: null,
      authorizationCheckedOrderId: null,
      error: null
    });
  },

  goBackToSetup: () => {
    invalidateSession();
    set({
      step: 'setup',
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      currentPhysicalStock: null,
      targetOrderItemId: null,
      warehouseCandidates: [],
      error: null,
      exitItems: [], // Limpiar items de salida
      scannedItemsProgress: new Map(), // Limpiar progreso de escaneo
      canRegisterExit: true,
      authorizationMessage: null
    });
  }
}));
