import { create } from "zustand";

// supabase
import { supabase } from "@/lib/supabase";
import { logOperationError } from "@/lib/operationLogger";
import {
  clearPersistentIdempotencyKey,
  createIdempotencyKey,
  getOrCreatePersistentIdempotencyKey,
} from "@/lib/idempotency";
import {
  fetchBrands,
  fetchCategories,
  fetchPendingPurchaseOrders,
  fetchPurchaseOrderItems,
  fetchSuppliers,
  fetchWarehouses,
} from "../services/entriesService";
import {
  EntryValidationQueryError,
  fetchEntryValidationData,
  fetchInventoryEntriesForOrders,
  fetchPurchaseOrderDetail,
} from "../services/entriesQueries";
import { errorMessage } from "@/lib/errorMessage";

// types
import { Database, type Json } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type Category = Database["public"]["Tables"]["category"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];
type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderItem =
  Database["public"]["Tables"]["purchase_order_items"]["Row"];

export type EntryType = "PO_ENTRY" | "ENTRY" | "INITIAL_LOAD";
export type EntryStep = "flow-selection" | "setup" | "scanning" | "product-form";
export type EntryUiStage = "idle" | "product_review" | "entry_review" | "success";

export type EntryScanResult =
  | { status: "found"; product: Product; error: null }
  | { status: "not_found"; product: null; error: null }
  | { status: "error"; product: null; error: string };

export type EntryActionResult =
  | { ok: true; error: null }
  | { ok: false; error: string };

export interface FinalizeEntrySummary {
  entryType: EntryType;
  orderNumber: string | null;
  productCount: number;
  totalUnits: number;
  orderCompleted: boolean;
}

export type EntryFailure = { message: string; code?: string; details?: string };

export type FinalizeEntryResult =
  | { ok: true; error: null; summary: FinalizeEntrySummary }
  | { ok: false; error: EntryFailure; summary: null };

export interface EntryItem {
  product: Product;
  quantity: number;
  barcode: string;
}

export interface NewProductData {
  name: string;
  sku: string;
  barcode: string;
  category_id: string;
  brand_id: string;
  description?: string;
  supplier_id?: string;
}

export interface PurchaseOrderItemWithProduct extends PurchaseOrderItem {
  product: Product;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItemWithProduct[];
  supplier?: Supplier;
}

export interface SelectedPurchaseOrderProgressItem {
  item: PurchaseOrderItemWithProduct;
  orderQuantity: number;
  registered: number;
  sessionScanned: number;
  pending: number;
  isComplete: boolean;
}

export interface SelectedPurchaseOrderProgress {
  items: SelectedPurchaseOrderProgressItem[];
  totalRequired: number;
  totalRegistered: number;
  totalScanned: number;
  totalCompleted: number;
}

const pendingProductRequests = new Map<string, string>();

/** Incrementado en reset()/resetAll(); las acciones async lo capturan al iniciar
 * y verifican antes de escribir su resultado, para no pisar un store ya reseteado
 * (p. ej. el usuario cambia de pestaña mientras hay un scan/finalize en curso). */
let resetGeneration = 0;

/** true mientras register_inventory_entries_batch está en vuelo, aunque el store se resetee. */
let finalizeInFlight = false;

const CATALOG_LOAD_ERROR =
  "No fue posible cargar los datos. Revisa tu conexión e intenta de nuevo.";

/**
 * Caché (producto -> recibido, truncado a lo pedido y sin ceros) y validación de una orden
 * a partir de sus entradas registradas.
 */
function summarizeOrderProgress(
  order: PurchaseOrderWithItems,
  entries: { product_id: string | null; quantity: number }[]
): {
  cache: Record<string, number>;
  validation: { isComplete: boolean; totalQuantityOfInventoryEntries: number; totalItemsQuantity: number };
} {
  const registeredByProduct: Record<string, number> = {};
  entries.forEach((entry) => {
    if (!entry.product_id) return;
    registeredByProduct[entry.product_id] = (registeredByProduct[entry.product_id] || 0) + (entry.quantity || 0);
  });
  const cache: Record<string, number> = {};
  let totalQuantityOfInventoryEntries = 0;
  const totalItemsQuantity = order.items.reduce((sum, item) => {
    const clampedRegistered = Math.min(registeredByProduct[item.product_id] || 0, item.quantity);
    if (clampedRegistered > 0) cache[item.product_id] = clampedRegistered;
    totalQuantityOfInventoryEntries += clampedRegistered;
    return sum + item.quantity;
  }, 0);
  return {
    cache,
    validation: {
      isComplete: totalQuantityOfInventoryEntries >= totalItemsQuantity && totalItemsQuantity > 0,
      totalQuantityOfInventoryEntries,
      totalItemsQuantity,
    },
  };
}

export interface EntriesState {
  // Sesión de entrada (null hasta elegir tipo en flow-selection)
  entryType: EntryType | null;
  supplierId: string | null;
  purchaseOrderId: string | null;
  selectedPurchaseOrder: PurchaseOrderWithItems | null; // Orden completa seleccionada
  warehouseId: string | null;
  selectedOrderProductId: string | null; // Producto seleccionado de la orden
  entryItems: EntryItem[];

  // Progreso de escaneo para órdenes de compra
  scannedItemsProgress: Map<string, number>; // product_id -> cantidad escaneada en sesión

  // Estado actual de escaneo
  currentProduct: Product | null;
  currentScannedBarcode: string | null;
  currentQuantity: number;

  // Estado de UI
  loading: boolean;
  /** true solo mientras register_inventory_entries_batch está en vuelo (único caso de modal bloqueante). */
  finalizing: boolean;
  loadingMessage: string | null;
  error: string | null;
  /** Fallo al cargar proveedores/bodegas/órdenes/categorías; los pickers lo muestran con reintentar. */
  catalogError: string | null;
  /**
   * Resultado de un finalize que terminó después de que la pantalla se reseteó
   * (el operario cambió de pestaña). Se muestra al volver y se descarta con
   * dismissLastFinalizeResult().
   */
  lastFinalizeResult: FinalizeEntryResult | null;
  step: EntryStep;
  uiStage: EntryUiStage;
  setupStep: "supplier" | "purchase-order" | "warehouse"; // Paso actual en el setup

  // Datos para formularios
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrderWithItems[];
  warehouses: Warehouse[];
  categories: Category[];
  brands: Brand[];

  // Filtros
  supplierSearchQuery: string;

  // Validación de órdenes de compra (por orden)
  purchaseOrderValidations: Record<
    string,
    {
      isComplete: boolean;
      totalQuantityOfInventoryEntries: number;
      totalItemsQuantity: number;
    }
  >;

  // Cache de entradas registradas por orden y producto (para evitar consultas redundantes)
  registeredEntriesCache: Record<string, Record<string, number>>; // orderId -> productId -> quantity

  // Actions - Setup
  setEntryType: (type: EntryType | null) => void;
  setSupplier: (supplierId: string | null) => void;
  setPurchaseOrder: (purchaseOrderId: string | null) => Promise<void>;
  selectPurchaseOrder: (purchaseOrderId: string) => Promise<void>;
  validateProductAgainstOrder: (
    productId: string,
    quantity: number
  ) => {
    valid: boolean;
    error?: string;
  };
  setWarehouse: (warehouseId: string | null) => void;
  setSelectedOrderProduct: (productId: string | null) => void;
  setSetupStep: (step: "supplier" | "purchase-order" | "warehouse") => void;
  setSupplierSearchQuery: (query: string) => void;
  loadSuppliers: () => Promise<void>;
  loadPurchaseOrders: (supplierId: string) => Promise<void>;
  validatePurchaseOrderProgress: (purchaseOrderId: string) => Promise<void>;
  validateAllPurchaseOrders: () => Promise<void>;
  getSelectedPurchaseOrderProgress: () => SelectedPurchaseOrderProgress | null;
  getResetGeneration: () => number;
  loadWarehouses: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadBrands: () => Promise<void>;
  openEntryConfirmation: () => boolean;
  /** @internal implementación real de openEntryConfirmation, envuelta arriba en un try/catch defensivo. */
  _openEntryConfirmationImpl: () => boolean;
  startEntry: () => void;

  // Actions - Scanning
  scanBarcode: (barcode: string) => Promise<EntryScanResult>;
  searchProductByBarcode: (barcode: string) => Promise<Product | null>;
  addProductToEntry: (
    product: Product,
    quantity: number,
    barcode: string
  ) => Promise<EntryActionResult>;
  removeProductFromEntry: (index: number) => void;
  /** Deshacer un "quitar": reinserta el producto en su posición si la orden aún lo permite. */
  restoreEntryItem: (item: EntryItem, index: number) => EntryActionResult;
  updateProductQuantity: (index: number, quantity: number) => void;
  setQuantity: (quantity: number) => void;

  // Actions - Product Creation
  createProduct: (
    productData: NewProductData
  ) => Promise<{ product: Product | null; error: EntryFailure | null }>;

  // Actions - Finalize
  finalizeEntry: (userId: string) => Promise<FinalizeEntryResult>;
  dismissLastFinalizeResult: () => void;
  setUiStage: (stage: EntryUiStage) => void;

  // Actions - Reset
  reset: () => void;
  resetAll: () => void;
  /** "Registrar otra entrada": limpia la sesión de escaneo conservando tipo, proveedor, orden y bodega. */
  startNewSession: () => void;
  clearError: () => void;
  resetCurrentScan: () => void;
  goBackToSetup: () => void;
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  // Initial state
  entryType: null,
  supplierId: null,
  purchaseOrderId: null,
  selectedPurchaseOrder: null,
  warehouseId: null,
  selectedOrderProductId: null,
  entryItems: [],
  scannedItemsProgress: new Map(),
  currentProduct: null,
  currentScannedBarcode: null,
  currentQuantity: 1,
  loading: false,
  finalizing: false,
  loadingMessage: null,
  error: null,
  catalogError: null,
  lastFinalizeResult: null,
  step: "flow-selection",
  uiStage: "idle",
  setupStep: "supplier",
  suppliers: [],
  purchaseOrders: [],
  warehouses: [],
  categories: [],
  brands: [],
  supplierSearchQuery: "",
  purchaseOrderValidations: {},
  registeredEntriesCache: {},

  // Setup actions
  setEntryType: (type) => {
    if (type === null) {
      set({
        entryType: null,
        step: "flow-selection",
        setupStep: "supplier",
        purchaseOrderId: null,
        selectedPurchaseOrder: null,
        scannedItemsProgress: new Map(),
        selectedOrderProductId: null,
        uiStage: "idle",
      });
      return;
    }
    set({
      entryType: type,
      step: "setup",
      setupStep: type === "INITIAL_LOAD" ? "warehouse" : "supplier",
      purchaseOrderId: null,
      selectedPurchaseOrder: null,
      scannedItemsProgress: new Map(),
      selectedOrderProductId: null,
      uiStage: "idle",
    });
  },

  setSupplier: (supplierId) => {
    set({ supplierId, purchaseOrderId: null }); // Resetear PO cuando cambia el proveedor
    if (supplierId) {
      get().loadPurchaseOrders(supplierId);
      // No avanzar automáticamente, el usuario decide si quiere ver las órdenes o saltarlas
    }
  },

  setPurchaseOrder: async (purchaseOrderId) => {
    set({
      purchaseOrderId,
      selectedOrderProductId: null,
      scannedItemsProgress: new Map(),
    }); // Resetear producto seleccionado y progreso
    if (purchaseOrderId) {
      await get().selectPurchaseOrder(purchaseOrderId);
      get().setSetupStep("warehouse");
    } else {
      set({ selectedPurchaseOrder: null });
    }
  },

  selectPurchaseOrder: async (purchaseOrderId: string) => {
    const capturedGeneration = resetGeneration;
    set({ loading: true, loadingMessage: 'Cargando detalles de la orden de compra...', error: null });

    try {
      // Usar la orden ya cargada en la lista; si no está, traerla con todos sus detalles.
      const existingOrder = get().purchaseOrders.find((order) => order.id === purchaseOrderId);
      let purchaseOrder: PurchaseOrderWithItems | null = existingOrder?.items ? existingOrder : null;

      if (!purchaseOrder) {
        try {
          purchaseOrder = await fetchPurchaseOrderDetail(purchaseOrderId);
        } catch (orderError: unknown) {
          if (resetGeneration !== capturedGeneration) return;
          console.error("Error loading purchase order details:", orderError);
          logOperationError({
            error_code: "PURCHASE_ORDER_LOAD_FAILED",
            error_message: errorMessage(orderError),
            module: "entries",
            operation: "select_purchase_order",
            step: "query",
            entity_type: "purchase_order",
            entity_id: purchaseOrderId,
          });
          set({ selectedPurchaseOrder: null, purchaseOrderId: null, loading: false, loadingMessage: null, error: errorMessage(orderError) });
          return;
        }
        if (resetGeneration !== capturedGeneration) return;
        if (!purchaseOrder) {
          set({ selectedPurchaseOrder: null, purchaseOrderId: null, loading: false, loadingMessage: null, error: "Orden de compra no encontrada" });
          return;
        }
      }

      // Reemplazar (no sumar) la caché de entradas registradas de esta orden desde BD.
      const inventoryEntries = await fetchInventoryEntriesForOrders([purchaseOrderId]);
      if (resetGeneration !== capturedGeneration) return;

      const orderCache: Record<string, number> = {};
      inventoryEntries.forEach((entry) => {
        if (!entry.product_id) return;
        orderCache[entry.product_id] = (orderCache[entry.product_id] || 0) + entry.quantity;
      });

      set({
        registeredEntriesCache: { ...get().registeredEntriesCache, [purchaseOrderId]: orderCache },
        selectedPurchaseOrder: purchaseOrder,
        purchaseOrderId,
        scannedItemsProgress: new Map(),
        loading: false,
        loadingMessage: null,
      });
    } catch (error: unknown) {
      if (resetGeneration !== capturedGeneration) return;
      console.error("Error loading purchase order details:", error);
      set({ selectedPurchaseOrder: null, purchaseOrderId: null, loading: false, loadingMessage: null, error: errorMessage(error) });
    }
  },

  validateProductAgainstOrder: (productId: string, deltaQuantity: number) => {
    const {
      selectedPurchaseOrder,
      registeredEntriesCache,
      purchaseOrderId,
      entryItems,
    } = get();

    if (!selectedPurchaseOrder || !purchaseOrderId) {
      return { valid: false, error: "No hay orden de compra seleccionada" };
    }

    // Buscar el producto en los items de la orden
    const orderItem = selectedPurchaseOrder.items.find(
      (item) => item.product_id === productId
    );

    if (!orderItem) {
      return {
        valid: false,
        error: "Este producto no está incluido en la orden de compra",
      };
    }

    // Cantidad ya registrada en BD
    const registeredInBD =
      registeredEntriesCache[purchaseOrderId]?.[productId] || 0;

    // Cantidad ya agregada en esta sesión (en el carrito)
    const sessionTotal = entryItems
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

    const newTotal = registeredInBD + sessionTotal + deltaQuantity;

    if (newTotal > orderItem.quantity) {
      const maxAllowable = Math.max(
        orderItem.quantity - registeredInBD - sessionTotal,
        0
      );
      return {
        valid: false,
        error:
          `La cantidad excede lo permitido para este producto.\n` +
          `Cantidad en orden: ${orderItem.quantity}\n` +
          `Ya registrado en el sistema: ${registeredInBD}\n` +
          `Ya agregado en esta sesión: ${sessionTotal}\n` +
          `Intentando agregar ahora: ${deltaQuantity}\n` +
          (maxAllowable > 0
            ? `Máximo adicional permitido en esta sesión: ${maxAllowable}.`
            : `Ya no hay unidades pendientes en la orden para este producto.`),
      };
    }

    return { valid: true };
  },

  setWarehouse: (warehouseId) => {
    set({ warehouseId });
  },

  setSelectedOrderProduct: (productId) => {
    set({ selectedOrderProductId: productId });
  },

  setSetupStep: (step) => {
    set({ setupStep: step });
  },

  setSupplierSearchQuery: (query) => {
    set({ supplierSearchQuery: query });
  },

  loadSuppliers: async () => {
    try {
      const data = await fetchSuppliers();
      set({ suppliers: data, catalogError: null });
    } catch (error: unknown) {
      console.error("Error loading suppliers:", error);
      set({ suppliers: [], catalogError: CATALOG_LOAD_ERROR });
    }
  },

  loadPurchaseOrders: async (supplierId: string) => {
    const capturedGeneration = resetGeneration;
    set({ loading: true, loadingMessage: 'Cargando órdenes de compra pendientes...' });
    try {
      const orders = await fetchPendingPurchaseOrders(supplierId);
      if (resetGeneration !== capturedGeneration) return;

      const orderIds = orders.map((order) => order.id);
      let allItems: Awaited<ReturnType<typeof fetchPurchaseOrderItems>> = [];
      if (orderIds.length > 0) {
        try {
          allItems = await fetchPurchaseOrderItems(orderIds);
        } catch (itemsError: unknown) {
          console.error("Error loading purchase order items:", itemsError);
        }
      }

      const itemsByOrderId = new Map<string, typeof allItems>();
      allItems.forEach((item) => {
        const list = itemsByOrderId.get(item.purchase_order_id) || [];
        list.push(item);
        itemsByOrderId.set(item.purchase_order_id, list);
      });

      const ordersWithItems: PurchaseOrderWithItems[] = orders.map((order) => ({
        ...order,
        items: (itemsByOrderId.get(order.id) || []).map((item) => ({
          ...item,
          // El join solo trae id/name/barcode/sku/deleted_at; es lo que usan las pantallas.
          product: item.products as unknown as Product,
        })),
      }));

      if (resetGeneration !== capturedGeneration) return;
      set({ purchaseOrders: ordersWithItems, loading: false, loadingMessage: null });

      if (ordersWithItems.length > 0) {
        void get().validateAllPurchaseOrders();
      }
    } catch (error: unknown) {
      console.error("Error loading purchase orders:", error);
      if (resetGeneration !== capturedGeneration) return;
      set({
        purchaseOrders: [],
        loading: false,
        loadingMessage: null,
        catalogError: "No fue posible cargar las órdenes de compra. Revisa tu conexión e intenta de nuevo.",
      });
    }
  },

  validatePurchaseOrderProgress: async (purchaseOrderId: string): Promise<void> => {
    try {
      const purchaseOrder = get().purchaseOrders.find((order) => order.id === purchaseOrderId);
      if (!purchaseOrder) {
        console.warn("Purchase order not found in store:", purchaseOrderId);
        return;
      }
      const entries = await fetchInventoryEntriesForOrders([purchaseOrderId]);
      const { cache, validation } = summarizeOrderProgress(purchaseOrder, entries);
      const { purchaseOrderValidations, registeredEntriesCache } = get();
      set({
        purchaseOrderValidations: { ...purchaseOrderValidations, [purchaseOrderId]: validation },
        registeredEntriesCache: { ...registeredEntriesCache, [purchaseOrderId]: cache },
      });
    } catch (error: unknown) {
      console.error("Error validating purchase order progress:", error);
      set({ catalogError: "No fue posible verificar el progreso de la orden de compra. Actualiza antes de continuar." });
    }
  },

  validateAllPurchaseOrders: async (): Promise<void> => {
    const { purchaseOrders } = get();
    if (purchaseOrders.length === 0) return;

    // Una sola consulta para todas las órdenes (N -> 1).
    let allEntries: Awaited<ReturnType<typeof fetchInventoryEntriesForOrders>>;
    try {
      allEntries = await fetchInventoryEntriesForOrders(purchaseOrders.map((order) => order.id));
    } catch (entriesError: unknown) {
      console.error("Error loading inventory entries for validation:", entriesError);
      // Sin esto el progreso de las órdenes se mostraría en cero como si nada se hubiera recibido.
      set({ catalogError: "No fue posible verificar el progreso de las órdenes de compra. Actualiza antes de continuar." });
      return;
    }

    const entriesByOrderId = new Map<string, typeof allEntries>();
    allEntries.forEach((entry) => {
      if (!entry.purchase_order_id) return;
      const list = entriesByOrderId.get(entry.purchase_order_id) || [];
      list.push(entry);
      entriesByOrderId.set(entry.purchase_order_id, list);
    });

    const cache: Record<string, Record<string, number>> = {};
    const validations: EntriesState["purchaseOrderValidations"] = {};
    purchaseOrders.forEach((order) => {
      const summary = summarizeOrderProgress(order, entriesByOrderId.get(order.id) || []);
      cache[order.id] = summary.cache;
      validations[order.id] = summary.validation;
    });

    set({ purchaseOrderValidations: validations, registeredEntriesCache: cache });
  },

  getSelectedPurchaseOrderProgress:
    (): SelectedPurchaseOrderProgress | null => {
      const {
        selectedPurchaseOrder,
        purchaseOrderId,
        registeredEntriesCache,
        scannedItemsProgress,
      } = get();

      if (!selectedPurchaseOrder || !purchaseOrderId) {
        return null;
      }

      // Mostrar TODOS los productos de la orden (no filtrar por selectedOrderProductId)
      // Esto permite ver el progreso completo de toda la orden de compra
      const items = selectedPurchaseOrder.items || [];

      const normalizedItems: SelectedPurchaseOrderProgressItem[] = items.map(
        (item) => {
          const orderQuantity = item.quantity;
          const rawRegistered =
            registeredEntriesCache[purchaseOrderId]?.[item.product_id] || 0;
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

  loadWarehouses: async () => {
    try {
      const data = await fetchWarehouses();
      set({ warehouses: data, catalogError: null });
    } catch (error: unknown) {
      console.error("Error loading warehouses:", error);
      set({ warehouses: [], catalogError: CATALOG_LOAD_ERROR });
    }
  },

  loadCategories: async () => {
    try {
      const data = await fetchCategories();
      set({ categories: data, catalogError: null });
    } catch (error: unknown) {
      console.error("Error loading categories:", error);
      set({ categories: [], catalogError: CATALOG_LOAD_ERROR });
    }
  },

  loadBrands: async () => {
    try {
      const data = await fetchBrands();
      set({ brands: data, catalogError: null });
    } catch (error: unknown) {
      console.error("Error loading brands:", error);
      set({ brands: [], catalogError: CATALOG_LOAD_ERROR });
    }
  },

  openEntryConfirmation: () => {
    try {
      return get()._openEntryConfirmationImpl();
    } catch (error: unknown) {
      console.error('[openEntryConfirmation] Excepción no controlada:', error);
      void logOperationError({
        error_code: 'ENTRIES_OPEN_CONFIRMATION_CRASH',
        error_message: errorMessage(error),
        module: 'entries',
        operation: 'open_entry_confirmation',
        severity: 'error',
        context: {
          entryType: get().entryType,
          warehouseId: get().warehouseId,
          supplierId: get().supplierId,
          purchaseOrderId: get().purchaseOrderId,
        },
      });
      set({ error: 'Ocurrió un error inesperado al continuar. Intenta de nuevo.' });
      return false;
    }
  },

  _openEntryConfirmationImpl: () => {
    const {
      supplierId,
      warehouseId,
      entryType,
      purchaseOrderId,
      purchaseOrderValidations,
    } = get();

    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
      return false;
    }

    if (!entryType) {
      set({ error: "Debe seleccionar un tipo de entrada" });
      return false;
    }

    if (entryType === "PO_ENTRY" && !supplierId) {
      set({
        error: "Debe seleccionar un proveedor para entrada con orden de compra",
      });
      return false;
    }

    if (entryType === "PO_ENTRY" && !purchaseOrderId) {
      set({ error: "Debe seleccionar una orden de compra" });
      return false;
    }

    // Validar si hay una orden de compra seleccionada y si está completa
    if (entryType === "PO_ENTRY" && purchaseOrderId) {
      const validation = purchaseOrderValidations[purchaseOrderId];
      if (validation?.isComplete) {
        set({
          error:
            "Esta orden de compra ya está completa. No se pueden escanear más productos.",
        });
        return false;
      }
    }

    // La configuración ya muestra el resumen en su último paso; no hay pantalla intermedia.
    set({ error: null });
    return true;
  },

  startEntry: () => {
    const opened = get().openEntryConfirmation();
    if (!opened) return;
    set({ step: "scanning", uiStage: "idle", error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string): Promise<EntryScanResult> => {
    const capturedGeneration = resetGeneration;
    set({
      error: null,
      currentScannedBarcode: barcode,
      currentQuantity: 1,
    });
    try {
      const product = await get().searchProductByBarcode(barcode);
      if (resetGeneration !== capturedGeneration) {
        // La pantalla se reseteó (p. ej. el usuario cambió de pestaña) mientras
        // buscábamos el producto; no escribir sobre un store ya limpiado.
        return { status: "not_found", product: null, error: null };
      }
      if (product) {
        const { purchaseOrderId } = get();

        // Si hay una orden de compra seleccionada, SIEMPRE validar contra ella (independiente del entryType)
        // Esto previene que se puedan escanear productos excediendo las cantidades de la orden
        if (purchaseOrderId) {
          const validation = get().validateProductAgainstOrder(product.id, 1); // Validar con cantidad 1 inicialmente

          if (!validation.valid) {
            set({
              error: validation.error || "Producto no válido para esta orden",
              currentProduct: null,
              currentScannedBarcode: null,
            });
            return {
              status: "error",
              product: null,
              error: validation.error || "Producto no válido para esta orden",
            };
          }

          // NOTA: Ya no se requiere seleccionar un producto específico de la orden
          // El sistema valida automáticamente contra toda la orden usando validateProductAgainstOrder()
          // Esto permite escanear cualquier producto de la OC sin preselección (similar a Exits)
        }

        set({ currentProduct: product, step: "scanning", uiStage: "product_review" });
        return { status: "found", product, error: null };
      } else {
        const { entryType, purchaseOrderId } = get();
        if (entryType === "PO_ENTRY" || purchaseOrderId) {
          const message = "El código no corresponde a un producto registrado en esta orden de compra";
          set({
            currentProduct: null,
            currentScannedBarcode: null,
            step: "scanning",
            uiStage: "idle",
            error: message,
          });
          return { status: "error", product: null, error: message };
        }
        set({
          currentProduct: null,
          step: "product-form",
          uiStage: "idle",
          error: null, // No es error, es flujo normal
        });
        return { status: "not_found", product: null, error: null };
      }
    } catch (error: unknown) {
      const message = errorMessage(error, "Error al buscar el producto");
      set({
        error: message,
        step: "scanning",
        currentProduct: null,
        currentScannedBarcode: null, // Limpiar para que reaparezcan los botones del escáner
      });
      return { status: "error", product: null, error: message };
    }
  },

  searchProductByBarcode: async (barcode: string): Promise<Product | null> => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("barcode", barcode)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Product) ?? null;
  },

  addProductToEntry: async (product, quantity, barcode) => {
    // GUARD: Prevenir doble ejecución por doble-tap
    // Si currentProduct ya fue limpiado por una ejecución previa, ignorar
    if (!get().currentProduct) {
      console.warn('[addProductToEntry] currentProduct es null, ignorando llamada duplicada');
      return { ok: false, error: "El producto ya fue procesado" };
    }

    const {
      entryItems,
      purchaseOrderId,
      entryType,
      scannedItemsProgress,
    } = get();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const error = "La cantidad debe ser un número mayor que cero";
      set({ error });
      return { ok: false, error };
    }

    // Si hay una orden de compra seleccionada, SIEMPRE validar contra ella (independiente del entryType)
    // Esto previene que se puedan agregar productos excediendo las cantidades de la orden
    if (purchaseOrderId) {
      // Validar contra la orden usando la nueva función
      const validation = get().validateProductAgainstOrder(
        product.id,
        quantity
      );
      if (!validation.valid) {
        const error = validation.error || "Producto no válido para esta orden";
        set({ error });
        return { ok: false, error };
      }

      // NOTA: Ya no se requiere seleccionar un producto específico de la orden
      // El sistema valida automáticamente contra toda la orden (similar a Exits)

      // Actualizar progreso de escaneo para flujo PO_ENTRY
      if (entryType === "PO_ENTRY") {
        const currentProgress = scannedItemsProgress.get(product.id) || 0;
        const newProgress = new Map(scannedItemsProgress);
        newProgress.set(product.id, currentProgress + quantity);
        set({ scannedItemsProgress: newProgress });
      }
    }

    // Verificar si el producto ya está en la lista
    const existingIndex = entryItems.findIndex(
      (item) => item.product.id === product.id
    );

    if (existingIndex >= 0) {
      const updatedItems = entryItems.map((item, index) =>
        index === existingIndex
          ? { ...item, quantity: item.quantity + quantity }
          : item
      );
      set({ entryItems: updatedItems, error: null });
    } else {
      // Si no existe, agregarlo
      set({
        entryItems: [...entryItems, { product, quantity, barcode }],
        error: null,
      });
    }

    // Resetear el escaneo actual
    get().resetCurrentScan();
    return { ok: true, error: null };
  },

  removeProductFromEntry: (index) => {
    const { entryItems, purchaseOrderId, entryType, scannedItemsProgress } =
      get();

    const itemToRemove = entryItems[index];
    if (!itemToRemove) {
      return;
    }

    const updatedItems = entryItems.filter((_, i) => i !== index);
    set({ entryItems: updatedItems });

    // Ajustar progreso de escaneo si es entrada con orden de compra
    if (purchaseOrderId && entryType === "PO_ENTRY") {
      const productId = itemToRemove.product.id;
      const currentProgress = scannedItemsProgress.get(productId) || 0;
      const newProgressValue = Math.max(
        0,
        currentProgress - itemToRemove.quantity
      );

      const newProgress = new Map(scannedItemsProgress);
      if (newProgressValue === 0) {
        newProgress.delete(productId);
      } else {
        newProgress.set(productId, newProgressValue);
      }
      set({ scannedItemsProgress: newProgress });
    }
  },

  restoreEntryItem: (item, index) => {
    const { entryItems, purchaseOrderId, entryType, scannedItemsProgress } = get();
    if (entryItems.some((existing) => existing.product.id === item.product.id)) {
      return { ok: false, error: "El producto ya está de nuevo en la entrada" };
    }
    if (purchaseOrderId) {
      const validation = get().validateProductAgainstOrder(item.product.id, item.quantity);
      if (!validation.valid) {
        return { ok: false, error: validation.error || "La orden ya no permite esta cantidad" };
      }
    }
    const next = [...entryItems];
    next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
    const patch: Partial<EntriesState> = { entryItems: next, error: null };
    if (purchaseOrderId && entryType === "PO_ENTRY") {
      const newProgress = new Map(scannedItemsProgress);
      newProgress.set(item.product.id, (scannedItemsProgress.get(item.product.id) || 0) + item.quantity);
      patch.scannedItemsProgress = newProgress;
    }
    set(patch);
    return { ok: true, error: null };
  },

  updateProductQuantity: (index, quantity) => {
    const { entryItems, purchaseOrderId, entryType, scannedItemsProgress } =
      get();

    const item = entryItems[index];
    if (!item) return;

    // Validar cantidad
    if (!Number.isFinite(quantity) || quantity <= 0) {
      set({
        error:
          "La cantidad debe ser mayor a 0. Si no desea el producto, elimínelo de la lista.",
      });
      return;
    }

    const MAX_QTY = 1_000_000;
    if (quantity > MAX_QTY) {
      set({
        error: `La cantidad no puede exceder ${MAX_QTY} unidades para un solo producto.`,
      });
      return;
    }

    let delta = quantity - item.quantity;

    // Si hay orden de compra y la cantidad aumenta, validar contra la orden.
    // Igual que addProductToEntry: aplica siempre que haya orden, sin importar entryType.
    if (purchaseOrderId && delta > 0) {
      const validation = get().validateProductAgainstOrder(
        item.product.id,
        delta
      );
      if (!validation.valid) {
        set({ error: validation.error });
        return;
      }
    }

    // Actualizar lista de items
    const updatedItems = [...entryItems];
    updatedItems[index] = { ...item, quantity };
    set({ entryItems: updatedItems, error: null });

    // Ajustar progreso de escaneo si aplica
    if (purchaseOrderId && entryType === "PO_ENTRY" && delta !== 0) {
      const currentProgress = scannedItemsProgress.get(item.product.id) || 0;
      const newProgressValue = Math.max(0, currentProgress + delta);
      const newProgress = new Map(scannedItemsProgress);

      if (newProgressValue === 0) {
        newProgress.delete(item.product.id);
      } else {
        newProgress.set(item.product.id, newProgressValue);
      }

      set({ scannedItemsProgress: newProgress });
    }
  },

  setQuantity: (quantity) => {
    set({ currentQuantity: quantity >= 0 ? quantity : 0 });
  },

  // Product creation
  createProduct: async (
    productData
  ): Promise<{ product: Product | null; error: EntryFailure | null }> => {
    try {
      const normalizedProduct = {
        name: productData.name.trim(),
        sku: productData.sku.trim(),
        barcode: productData.barcode.trim(),
        categoryId: productData.category_id,
        brandId: productData.brand_id,
        description: productData.description?.trim() || null,
        supplierId: productData.supplier_id || null,
      };
      const requestFingerprint = JSON.stringify(normalizedProduct);
      let idempotencyKey = pendingProductRequests.get(requestFingerprint);
      if (!idempotencyKey) {
        idempotencyKey = createIdempotencyKey();
        pendingProductRequests.set(requestFingerprint, idempotencyKey);
      }

      const { data, error } = await supabase.rpc("create_inventory_product", {
        p_name: normalizedProduct.name,
        p_sku: normalizedProduct.sku,
        p_barcode: normalizedProduct.barcode,
        p_category_id: normalizedProduct.categoryId,
        p_brand_id: normalizedProduct.brandId,
        p_description: normalizedProduct.description,
        p_supplier_id: normalizedProduct.supplierId,
        p_idempotency_key: idempotencyKey,
      });

      if (error) {
        return { product: null, error: { message: error.message, code: error.code, details: error.details } };
      }

      const product = (data as Product | null);
      if (!product?.id) {
        return {
          product: null,
          error: { message: "La creación del producto no devolvió un producto válido" },
        };
      }

      pendingProductRequests.delete(requestFingerprint);
      return { product, error: null };
    } catch (error: unknown) {
      return { product: null, error: { message: errorMessage(error, "No fue posible crear el producto") } };
    }
  },

  // Finalize entry
  finalizeEntry: async (userId): Promise<FinalizeEntryResult> => {
    const failure = (error: EntryFailure): FinalizeEntryResult => ({ ok: false, error, summary: null });
    // GUARD: doble-tap y finalize en vuelo. `finalizeInFlight` sobrevive a resetAll()
    // (que pone loading en false), así una segunda entrada no se registra encima de otra.
    if (get().loading || finalizeInFlight) {
      console.warn('[finalizeEntry] Ya se está procesando una entrada, ignorando llamada duplicada');
      return failure({ message: "Ya se está procesando esta entrada" });
    }

    const capturedGeneration = resetGeneration;
    const isStale = () => resetGeneration !== capturedGeneration;

    const {
      entryItems,
      supplierId,
      purchaseOrderId,
      warehouseId,
      entryType,
      selectedPurchaseOrder,
    } = get();

    if (entryItems.length === 0) {
      return failure({ message: "No hay productos para registrar" });
    }

    if (!warehouseId) {
      return failure({ message: "Debe seleccionar una bodega" });
    }

    if (!entryType) {
      return failure({ message: "Tipo de entrada no definido" });
    }

    if (!userId) {
      return failure({ message: "Usuario no autenticado" });
    }

    // Validación adicional para entradas con orden de compra
    if (entryType === "PO_ENTRY" && !supplierId) {
      return failure({
        message: "Debe seleccionar un proveedor para entrada con orden de compra",
      });
    }

    if (entryType === "PO_ENTRY" && !purchaseOrderId) {
      return failure({
        message: "Debe seleccionar una orden de compra para registrar la entrada.",
      });
    }

    // Establecer loading al inicio del proceso
    set({ loading: true, finalizing: true, loadingMessage: 'Registrando entrada...' });

    // Helper de validación exhaustiva antes de insertar
    const validateEntryDataBeforeInsert = async (): Promise<{
      valid: boolean;
      message?: string;
    }> => {
      // 1. Validar cantidades y duplicados en memoria
      const MAX_QTY = 1_000_000;
      const productIdSet = new Set<string>();

      for (const item of entryItems) {
        if (!item.product?.id) {
          return { valid: false, message: "Producto inválido en la lista" };
        }

        if (productIdSet.has(item.product.id)) {
          return {
            valid: false,
            message:
              "Hay productos duplicados en la lista. Por favor revise las cantidades.",
          };
        }
        productIdSet.add(item.product.id);

        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          return {
            valid: false,
            message:
              "Todas las cantidades deben ser mayores a 0. Revise los productos agregados.",
          };
        }

        if (item.quantity > MAX_QTY) {
          return {
            valid: false,
            message: `Las cantidades no pueden exceder ${MAX_QTY} unidades por producto.`,
          };
        }

        // Validar formato básico de código de barras (si existe)
        if (item.barcode) {
          const trimmed = item.barcode.trim();
          if (!trimmed || trimmed.length > 255) {
            return {
              valid: false,
              message:
                "Formato de código de barras inválido. Por favor intente escanear de nuevo.",
            };
          }
        }
      }

      // 2-4. Bodega, productos y orden se validan contra BD en paralelo.
      if (!warehouseId) {
        return { valid: false, message: "Debe seleccionar una bodega" };
      }
      const productIds = entryItems.map((item) => item.product.id);
      let validationData: Awaited<ReturnType<typeof fetchEntryValidationData>>;
      try {
        validationData = await fetchEntryValidationData({ warehouseId, productIds, purchaseOrderId });
      } catch (queryError: unknown) {
        console.error("Error validating entry data:", queryError);
        const step = queryError instanceof EntryValidationQueryError ? queryError.step : "warehouse";
        return {
          valid: false,
          message:
            step === "products"
              ? "Error al validar los productos de la entrada."
              : step === "order"
                ? "Error al validar el estado de la orden de compra."
                : "Error al validar la bodega seleccionada.",
        };
      }

      const { warehouse: warehouseData, products: productsData, orderStatus } = validationData;
      if (!warehouseData || !warehouseData.is_active || warehouseData.deleted_at) {
        return {
          valid: false,
          message:
            "La bodega seleccionada no está activa. Por favor seleccione otra bodega.",
        };
      }

      const deletedProducts = productsData.filter((p) => p.deleted_at !== null);
      if (productsData.length !== productIds.length || deletedProducts.length > 0) {
        return {
          valid: false,
          message:
            "Uno o más productos de la entrada han sido eliminados. Por favor actualice la página y revise la orden.",
        };
      }

      // Validación de orden de compra: SIEMPRE que haya purchaseOrderId, independiente del entryType.
      if (purchaseOrderId && orderStatus !== undefined) {
        if (orderStatus === null) {
          return {
            valid: false,
            message:
              "La orden de compra seleccionada ya no está disponible. Por favor recargue la pantalla.",
          };
        }

        // Solo validar estado para flujo PO_ENTRY, pero validar cantidades siempre
        if (entryType === "PO_ENTRY" && orderStatus !== "pending") {
          return {
            valid: false,
            message:
              "La orden de compra no está en estado pendiente. No se pueden registrar más entradas.",
          };
        }

        if (selectedPurchaseOrder) {
          const quantitiesByProduct: Record<string, number> = {};
          entryItems.forEach((item) => {
            quantitiesByProduct[item.product.id] =
              (quantitiesByProduct[item.product.id] || 0) + item.quantity;
          });

          const { registeredEntriesCache } = get();

          for (const orderItem of selectedPurchaseOrder.items) {
            const sessionQty = quantitiesByProduct[orderItem.product_id] || 0;
            if (sessionQty > 0) {
              const registeredInBD =
                registeredEntriesCache[purchaseOrderId]?.[orderItem.product_id] || 0;
              const totalAfterSession = registeredInBD + sessionQty;

              if (totalAfterSession > orderItem.quantity) {
                const pending = Math.max(orderItem.quantity - registeredInBD, 0);
                return {
                  valid: false,
                  message: `La cantidad excede lo permitido para este producto.\n` +
                    `Cantidad en orden: ${orderItem.quantity}\n` +
                    `Ya registrado en el sistema: ${registeredInBD}\n` +
                    `Intentando registrar en esta sesión: ${sessionQty}\n` +
                    `Pendiente disponible: ${pending}, Total después de esta sesión sería: ${totalAfterSession}`,
                };
              }
            }
          }
        }
      }

      return { valid: true };
    };

    finalizeInFlight = true;
    try {
    const validationResult = await validateEntryDataBeforeInsert();
    if (isStale()) {
      const result = failure({
        message: "La sesión se reinició antes de registrar. Los productos no se guardaron.",
      });
      set({ lastFinalizeResult: result });
      return result;
    }
    if (!validationResult.valid) {
      logOperationError({
        error_code: "ENTRY_VALIDATION_FAILED",
        error_message: validationResult.message || "Validation failed",
        module: "entries",
        operation: "finalize_entry",
        step: "validation",
        entity_type: purchaseOrderId ? "purchase_order" : undefined,
        entity_id: purchaseOrderId || undefined,
        context: {
          warehouseId,
          productIds: entryItems.map((i) => i.product.id),
          quantities: entryItems.map((i) => i.quantity),
          entryType,
          purchaseOrderId,
          supplierId,
        },
      });
      set({ loading: false, finalizing: false, loadingMessage: null });
      return failure({ message: validationResult.message || "Validación fallida" });
    }

      // Registrar cada producto en inventory_entries
      set({ loadingMessage: 'Guardando productos en el inventario...' });
      
      const requestFingerprint = JSON.stringify({
        warehouseId,
        supplierId,
        purchaseOrderId,
        entryType,
        entryItems: entryItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          barcode: item.barcode,
        })),
      });
      const idempotencyKey = await getOrCreatePersistentIdempotencyKey(
        "register_inventory_entries_batch",
        requestFingerprint
      );

      const { data: entryResult, error: entriesError } = await supabase.rpc(
        "register_inventory_entries_batch",
        {
          p_warehouse_id: warehouseId,
          p_supplier_id: supplierId,
          p_purchase_order_id: purchaseOrderId,
          p_entry_type: entryType,
          p_items: entryItems.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
            barcode_scanned: item.barcode,
          })) as unknown as Json,
          p_idempotency_key: idempotencyKey,
        }
      );

      if (entriesError) {
        logOperationError({
          error_code: "ENTRY_INSERT_FAILED",
          error_message: entriesError.message || String(entriesError),
          module: "entries",
          operation: "finalize_entry",
          step: "insert_records",
          entity_type: purchaseOrderId ? "purchase_order" : undefined,
          entity_id: purchaseOrderId || undefined,
          context: {
            warehouseId,
            productIds: entryItems.map((i) => i.product.id),
            quantities: entryItems.map((i) => i.quantity),
            entryType,
            purchaseOrderId,
            supplierId,
          },
        });
        const result = failure({
          message: entriesError.message || String(entriesError),
          code: entriesError.code,
          details: entriesError.details,
        });
        if (isStale()) {
          set({ lastFinalizeResult: result });
        } else {
          set({ loading: false, finalizing: false, loadingMessage: null });
        }
        return result;
      }

      const insertedEntryIds =
        (entryResult as { entry_ids?: string[] } | null)?.entry_ids || [];
      if (insertedEntryIds.length !== entryItems.length) {
        const result = failure({
          message: "La respuesta del registro de entradas está incompleta. Intente nuevamente.",
        });
        if (isStale()) {
          set({ lastFinalizeResult: result });
        } else {
          set({ loading: false, finalizing: false, loadingMessage: null });
        }
        return result;
      }

      // NOTA: No actualizamos warehouse_stock manualmente aquí porque
      // probablemente hay un trigger en la base de datos que lo hace automáticamente
      // al insertar en inventory_entries. Si se actualiza manualmente aquí también,
      // se duplicaría el incremento del stock.

      // Actualizar el cache de entradas registradas inmediatamente
      // y verificar si la orden está completa para actualizar el estado automáticamente
      // El RPC ya calculó el progreso de la orden (y la marcó recibida si aplica):
      // reflejarlo en la caché local sin volver a consultar la orden.
      const progressData = (entryResult as {
        purchase_order_progress?: { success?: boolean; all_complete?: boolean; updated?: boolean } | null;
      } | null)?.purchase_order_progress;
      const orderCompleted = Boolean(purchaseOrderId && progressData?.success && progressData.all_complete);

      if (purchaseOrderId && !isStale()) {
        const { registeredEntriesCache, purchaseOrderValidations } = get();
        const orderCache = { ...(registeredEntriesCache[purchaseOrderId] || {}) };
        entryItems.forEach((item) => {
          orderCache[item.product.id] = (orderCache[item.product.id] || 0) + item.quantity;
        });
        const previousValidation = purchaseOrderValidations[purchaseOrderId];
        set({
          registeredEntriesCache: { ...registeredEntriesCache, [purchaseOrderId]: orderCache },
          purchaseOrderValidations: {
            ...purchaseOrderValidations,
            [purchaseOrderId]: {
              isComplete: orderCompleted || Boolean(previousValidation?.isComplete),
              totalQuantityOfInventoryEntries:
                (previousValidation?.totalQuantityOfInventoryEntries || 0) +
                entryItems.reduce((sum, item) => sum + item.quantity, 0),
              totalItemsQuantity: previousValidation?.totalItemsQuantity || 0,
            },
          },
        });
      }

      await clearPersistentIdempotencyKey(
        "register_inventory_entries_batch",
        requestFingerprint
      );

      const result: FinalizeEntryResult = {
        ok: true,
        error: null,
        summary: {
          entryType,
          orderNumber: selectedPurchaseOrder?.order_number || null,
          productCount: entryItems.length,
          totalUnits: entryItems.reduce((sum, item) => sum + item.quantity, 0),
          orderCompleted,
        },
      };

      // Si el store se reseteó mientras se registraba (cambio de pestaña), la escritura
      // en BD fue exitosa: guardar el resultado para mostrarlo al volver en vez de
      // resucitar la pantalla de éxito sobre un store limpio.
      if (isStale()) {
        set({ lastFinalizeResult: result });
      } else {
        set({ loading: false, finalizing: false, loadingMessage: null, uiStage: "success" });
      }
      return result;
    } catch (error: unknown) {
      const result = failure({
        message: error instanceof Error ? error.message : String(error),
      });
      if (isStale()) {
        set({ lastFinalizeResult: result });
      } else {
        set({ loading: false, finalizing: false, loadingMessage: null });
      }
      return result;
    } finally {
      finalizeInFlight = false;
    }
  },

  dismissLastFinalizeResult: () => set({ lastFinalizeResult: null }),

  // Reset actions
  reset: () => {
    resetGeneration += 1;
    set({
      entryItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      error: null,
      loading: false,
      finalizing: false,
      loadingMessage: null,
      step: "flow-selection",
      uiStage: "idle",
      setupStep: "supplier",
      entryType: null,
      supplierId: null,
      purchaseOrderId: null,
      selectedPurchaseOrder: null,
      warehouseId: null,
      selectedOrderProductId: null,
      purchaseOrders: [],
      supplierSearchQuery: "",
      purchaseOrderValidations: {},
      scannedItemsProgress: new Map(),
    });
  },

  startNewSession: () => {
    resetGeneration += 1;
    set({
      entryItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      scannedItemsProgress: new Map(),
      error: null,
      loading: false,
      finalizing: false,
      loadingMessage: null,
      step: "setup",
      uiStage: "idle",
      setupStep: "warehouse",
    });
  },

  // Reset all state including cache - for navigation cleanup
  resetAll: () => {
    resetGeneration += 1;
    set({
      entryItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      error: null,
      loading: false,
      finalizing: false,
      loadingMessage: null,
      step: "flow-selection",
      uiStage: "idle",
      setupStep: "supplier",
      entryType: null,
      supplierId: null,
      purchaseOrderId: null,
      selectedPurchaseOrder: null,
      warehouseId: null,
      selectedOrderProductId: null,
      purchaseOrders: [],
      supplierSearchQuery: "",
      purchaseOrderValidations: {},
      scannedItemsProgress: new Map(),
      registeredEntriesCache: {},
      catalogError: null,
    });
  },

  resetCurrentScan: () => {
    set({
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      step: "scanning",
      uiStage: "idle",
    });
  },

  clearError: () => {
    set({ error: null });
  },

  setUiStage: (uiStage) => set({ uiStage }),
  getResetGeneration: () => resetGeneration,

  goBackToSetup: () => {
    set({
      step: "setup", // Regresar al setup del flujo actual
      uiStage: "idle",
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      error: null,
      // No limpiar scannedItemsProgress para mantener el progreso visible
    });
  },
}));
