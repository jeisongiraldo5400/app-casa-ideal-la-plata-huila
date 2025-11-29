import { create } from "zustand";

// supabase
import { supabase } from "@/lib/supabase";

// types
import { Database } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type Category = Database["public"]["Tables"]["category"]["Row"];
type Brand = Database["public"]["Tables"]["brands"]["Row"];
type PurchaseOrder = Database["public"]["Tables"]["purchase_orders"]["Row"];
type PurchaseOrderItem =
  Database["public"]["Tables"]["purchase_order_items"]["Row"];
type InventoryEntry =
  Database["public"]["Tables"]["inventory_entries"]["Insert"];

export type EntryType = "PO_ENTRY" | "ENTRY" | "INITIAL_LOAD";

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

interface EntriesState {
  // Sesión de entrada
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
  error: string | null;
  step: "flow-selection" | "setup" | "scanning" | "product-form"; // flow-selection: elegir tipo, setup: seleccionar supplier/PO/warehouse, scanning: escaneando, product-form: crear producto
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
  setEntryType: (type: EntryType) => void;
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
  loadWarehouses: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadBrands: () => Promise<void>;
  startEntry: () => void;

  // Actions - Scanning
  scanBarcode: (barcode: string) => Promise<void>;
  searchProductByBarcode: (barcode: string) => Promise<Product | null>;
  addProductToEntry: (
    product: Product,
    quantity: number,
    barcode: string
  ) => Promise<void>;
  removeProductFromEntry: (index: number) => void;
  updateProductQuantity: (index: number, quantity: number) => void;
  setQuantity: (quantity: number) => void;

  // Actions - Product Creation
  createProduct: (
    productData: NewProductData
  ) => Promise<{ product: Product | null; error: any }>;

  // Actions - Finalize
  finalizeEntry: (userId: string) => Promise<{ error: any }>;

  // Actions - Reset
  reset: () => void;
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
  error: null,
  step: "flow-selection",
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
    set({
      entryType: type,
      step: "setup",
      // Configurar el paso inicial del setup según el tipo
      setupStep: type === "INITIAL_LOAD" ? "warehouse" : "supplier",
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
    set({ loading: true, error: null });

    try {
      // Buscar la orden en las órdenes ya cargadas
      const { purchaseOrders } = get();
      const existingOrder = purchaseOrders.find(
        (order) => order.id === purchaseOrderId
      );

      let purchaseOrder: PurchaseOrderWithItems;

      if (existingOrder && existingOrder.items) {
        // Si ya tenemos la orden con items, usarla
        purchaseOrder = existingOrder;
      } else {
        // Si no está cargada, cargarla con todos los detalles
        const { data: orderData, error: orderError } = await supabase
          .from("purchase_orders")
          .select(
            `
            *,
            supplier:suppliers(id, name, nit),
            items:purchase_order_items(
              id,
              product_id,
              purchase_order_id,
              quantity,
              product:products(id, name, barcode, sku)
            )
          `
          )
          .eq("id", purchaseOrderId)
          .single();

        if (orderError) {
          console.error("Error loading purchase order details:", orderError);
          set({
            selectedPurchaseOrder: null,
            purchaseOrderId: null,
            loading: false,
            error: orderError.message,
          });
          return;
        }

        if (!orderData) {
          set({
            selectedPurchaseOrder: null,
            purchaseOrderId: null,
            loading: false,
            error: "Orden de compra no encontrada",
          });
          return;
        }

        // Transformar los datos al formato esperado
        purchaseOrder = {
          ...orderData,
          supplier: orderData.supplier as Supplier,
          items: (orderData.items || []).map((item: any) => ({
            ...item,
            product: item.product as Product,
          })),
        };
      }

      // Cargar entradas registradas para esta orden y actualizar el cache
      const { data: inventoryEntries, error: entriesError } = await supabase
        .from("inventory_entries")
        .select("product_id, quantity")
        .eq("purchase_order_id", purchaseOrderId);

      if (entriesError) {
        console.error("Error loading inventory entries:", entriesError);
      } else {
        // Actualizar el cache de entradas registradas
        // REEMPLAZAR los valores para esta orden (no sumar) porque estamos cargando desde BD
        const { registeredEntriesCache } = get();
        const updatedCache = { ...registeredEntriesCache };

        // Inicializar o REEMPLAZAR el objeto para esta orden
        updatedCache[purchaseOrderId] = {};

        // Agrupar por product_id y sumar las cantidades SOLO de las entradas de BD
        (inventoryEntries || []).forEach(
          (entry: { product_id: string; quantity: number }) => {
            updatedCache[purchaseOrderId][entry.product_id] =
              (updatedCache[purchaseOrderId][entry.product_id] || 0) + entry.quantity;
          }
        );

        set({ registeredEntriesCache: updatedCache });
      }

      set({
        selectedPurchaseOrder: purchaseOrder,
        purchaseOrderId,
        scannedItemsProgress: new Map(),
        loading: false,
      });
    } catch (error: any) {
      console.error("Error loading purchase order details:", error);
      set({
        selectedPurchaseOrder: null,
        purchaseOrderId: null,
        loading: false,
        error: error.message,
      });
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
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .is("deleted_at", null)
        .order("name");

      if (error) {
        console.error("Error loading suppliers:", error);
        set({ suppliers: [] });
        return;
      }
      set({ suppliers: data || [] });
    } catch (error: any) {
      console.error("Error loading suppliers:", error);
      set({ suppliers: [] });
    }
  },

  loadPurchaseOrders: async (supplierId: string) => {
    set({ loading: true });
    try {
      // Cargar órdenes de compra pendientes o en proceso para el proveedor
      const { data: orders, error: ordersError } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("supplier_id", supplierId)
        .in("status", ["pending"])
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.error("Error loading purchase orders:", ordersError);
        set({ purchaseOrders: [], loading: false });
        return;
      }

      // OPTIMIZADO: Cargar todos los items de todas las órdenes en una sola consulta
      // Esto reduce de N consultas a 1 consulta
      const orderIds = (orders || []).map((order) => order.id);

      let allItems: any[] = [];
      if (orderIds.length > 0) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("purchase_order_items")
          .select(
            `
            *,
            products(*),
            purchase_order_id
          `
          )
          .in("purchase_order_id", orderIds);

        if (itemsError) {
          console.error("Error loading purchase order items:", itemsError);
        } else {
          allItems = itemsData || [];
        }
      }

      // Agrupar items por purchase_order_id en memoria
      const itemsByOrderId = new Map<string, any[]>();
      allItems.forEach((item: any) => {
        const orderId = item.purchase_order_id;
        if (!itemsByOrderId.has(orderId)) {
          itemsByOrderId.set(orderId, []);
        }
        itemsByOrderId.get(orderId)!.push(item);
      });

      // Asignar items a cada orden
      const ordersWithItems: PurchaseOrderWithItems[] = (orders || []).map(
        (order) => ({
          ...order,
          items: (itemsByOrderId.get(order.id) || []).map((item: any) => ({
            ...item,
            product: item.products,
          })) as (PurchaseOrderItem & { product: Product })[],
        })
      );

      set({ purchaseOrders: ordersWithItems, loading: false });

      // Validar todas las órdenes después de cargarlas
      if (ordersWithItems.length > 0) {
        get().validateAllPurchaseOrders();
      }
    } catch (error: any) {
      console.error("Error loading purchase orders:", error);
      set({ purchaseOrders: [], loading: false });
    }
  },

  validatePurchaseOrderProgress: async (
    purchaseOrderId: string
  ): Promise<void> => {
    try {
      // Primero verificar que la orden esté cargada
      const purchaseOrder = get().purchaseOrders.find(
        (order) => order.id === purchaseOrderId
      );

      if (!purchaseOrder) {
        console.warn("Purchase order not found in store:", purchaseOrderId);
        return;
      }

      // Calcular la cantidad total de items en la orden
      const totalItemsQuantity = purchaseOrder.items.reduce(
        (acc, curr) => acc + curr.quantity,
        0
      );

      // Obtener las entradas de inventario para esta orden
      const { data, error } = await supabase
        .from("inventory_entries")
        .select("product_id, quantity")
        .eq("purchase_order_id", purchaseOrderId);

      if (error) {
        console.error("Error validating purchase order progress:", error);
        return;
      }

      // Calcular cantidades registradas por producto
      const registeredByProduct: Record<string, number> = {};
      (data || []).forEach((entry) => {
        if (!entry.product_id) return;
        registeredByProduct[entry.product_id] =
          (registeredByProduct[entry.product_id] || 0) + entry.quantity;
      });

      // Truncar por producto al máximo definido en la orden
      // Solo agregar productos con cantidad > 0 al cache
      const cacheForOrder: Record<string, number> = {};
      let totalQuantityOfInventoryEntries = 0;
      purchaseOrder.items.forEach((item) => {
        const rawRegistered = registeredByProduct[item.product_id] || 0;
        const clampedRegistered = Math.min(rawRegistered, item.quantity);
        
        // Solo agregar al cache si tiene cantidad registrada > 0
        if (clampedRegistered > 0) {
          cacheForOrder[item.product_id] = clampedRegistered;
        }
        
        totalQuantityOfInventoryEntries += clampedRegistered;
      });

      // Actualizar el estado de validación y el cache para esta orden específica
      const { purchaseOrderValidations, registeredEntriesCache } = get();
      set({
        purchaseOrderValidations: {
          ...purchaseOrderValidations,
          [purchaseOrderId]: {
            isComplete:
              totalQuantityOfInventoryEntries >= totalItemsQuantity &&
              totalItemsQuantity > 0,
            totalQuantityOfInventoryEntries,
            totalItemsQuantity,
          },
        },
        registeredEntriesCache: {
          ...registeredEntriesCache,
          [purchaseOrderId]: cacheForOrder,
        },
      });
    } catch (error: any) {
      console.error("Error validating purchase order progress:", error);
    }
  },

  validateAllPurchaseOrders: async (): Promise<void> => {
    const { purchaseOrders } = get();

    if (purchaseOrders.length === 0) {
      return;
    }

    // OPTIMIZADO: Cargar todas las entradas de inventario de todas las órdenes en una sola consulta
    // Esto reduce de N consultas a 1 consulta
    const orderIds = purchaseOrders.map((order) => order.id);

    const { data: allEntries, error: entriesError } = await supabase
      .from("inventory_entries")
      .select("purchase_order_id, product_id, quantity")
      .in("purchase_order_id", orderIds);

    if (entriesError) {
      console.error(
        "Error loading inventory entries for validation:",
        entriesError
      );
      return;
    }

    // Agrupar entradas por purchase_order_id en memoria
    const entriesByOrderId = new Map<string, any[]>();
    (allEntries || []).forEach((entry: any) => {
      const orderId = entry.purchase_order_id;
      if (!orderId) return;
      if (!entriesByOrderId.has(orderId)) {
        entriesByOrderId.set(orderId, []);
      }
      entriesByOrderId.get(orderId)!.push(entry);
    });

    // Construir cache truncado por producto y validaciones
    const cache: Record<string, Record<string, number>> = {};
    const validations: Record<
      string,
      {
        isComplete: boolean;
        totalQuantityOfInventoryEntries: number;
        totalItemsQuantity: number;
      }
    > = {};

    purchaseOrders.forEach((order) => {
      const entries = entriesByOrderId.get(order.id) || [];

      // Agrupar por producto
      const registeredByProduct: Record<string, number> = {};
      entries.forEach((entry: any) => {
        const productId = entry.product_id;
        if (!productId) return;
        registeredByProduct[productId] =
          (registeredByProduct[productId] || 0) + (entry.quantity || 0);
      });

      // Truncar cada producto al máximo definido en la orden
      // Solo agregar productos con cantidad > 0 al cache para evitar llenarlo con ceros
      cache[order.id] = {};
      let totalQuantityOfInventoryEntries = 0;
      const totalItemsQuantity = order.items.reduce((sum, item) => {
        const rawRegistered = registeredByProduct[item.product_id] || 0;
        const clampedRegistered = Math.min(rawRegistered, item.quantity);
        
        // Solo agregar al cache si tiene cantidad registrada > 0
        if (clampedRegistered > 0) {
          cache[order.id][item.product_id] = clampedRegistered;
        }
        
        totalQuantityOfInventoryEntries += clampedRegistered;
        return sum + item.quantity;
      }, 0);

      validations[order.id] = {
        isComplete:
          totalQuantityOfInventoryEntries >= totalItemsQuantity &&
          totalItemsQuantity > 0,
        totalQuantityOfInventoryEntries,
        totalItemsQuantity,
      };
    });

    // Actualizar todas las validaciones y el cache de una vez
    set({
      purchaseOrderValidations: validations,
      registeredEntriesCache: cache,
    });
  },

  getSelectedPurchaseOrderProgress:
    (): SelectedPurchaseOrderProgress | null => {
      const {
        selectedPurchaseOrder,
        purchaseOrderId,
        registeredEntriesCache,
        scannedItemsProgress,
        selectedOrderProductId,
      } = get();

      if (!selectedPurchaseOrder || !purchaseOrderId) {
        return null;
      }

      let items = selectedPurchaseOrder.items || [];

      console.log({ items });

      // Si hay un producto seleccionado, filtrar solo ese producto
      if (selectedOrderProductId) {
        items = items.filter(
          (item) => item.product_id === selectedOrderProductId
        );
      }

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

  loadCategories: async () => {
    try {
      const { data, error } = await supabase
        .from("category")
        .select("*")
        .is("deleted_at", null)
        .order("name");

      if (error) {
        console.error("Error loading categories:", error);
        set({ categories: [] });
        return;
      }
      set({ categories: data || [] });
    } catch (error: any) {
      console.error("Error loading categories:", error);
      set({ categories: [] });
    }
  },

  loadBrands: async () => {
    try {
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .is("deleted_at", null)
        .order("name");

      if (error) {
        console.error("Error loading brands:", error);
        set({ brands: [] });
        return;
      }
      set({ brands: data || [] });
    } catch (error: any) {
      console.error("Error loading brands:", error);
      set({ brands: [] });
    }
  },

  startEntry: () => {
    const {
      supplierId,
      warehouseId,
      entryType,
      purchaseOrderId,
      purchaseOrderValidations,
    } = get();

    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
      return;
    }

    if (entryType === "PO_ENTRY" && !supplierId) {
      set({
        error: "Debe seleccionar un proveedor para entrada con orden de compra",
      });
      return;
    }

    // Validar si hay una orden de compra seleccionada y si está completa
    if (entryType === "PO_ENTRY" && purchaseOrderId) {
      const validation = purchaseOrderValidations[purchaseOrderId];
      if (validation?.isComplete) {
        set({
          error:
            "Esta orden de compra ya está completa. No se pueden escanear más productos.",
        });
        return;
      }
    }

    set({ step: "scanning", error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string) => {
    set({
      loading: true,
      error: null,
      currentScannedBarcode: barcode,
      currentQuantity: 1,
    });
    try {
      const product = await get().searchProductByBarcode(barcode);
      if (product) {
        const { purchaseOrderId, entryType, selectedOrderProductId } = get();

        // Si hay una orden de compra seleccionada, validar contra ella
        if (purchaseOrderId && entryType === "PO_ENTRY") {
          const validation = get().validateProductAgainstOrder(product.id, 1); // Validar con cantidad 1 inicialmente

          if (!validation.valid) {
            set({
              loading: false,
              error: validation.error || "Producto no válido para esta orden",
              currentProduct: null,
              currentScannedBarcode: null,
            });
            return;
          }

          // Validar que el producto escaneado sea el seleccionado de la orden (si hay uno seleccionado)
          if (selectedOrderProductId && selectedOrderProductId !== product.id) {
            set({
              loading: false,
              error: "Debe escanear el producto seleccionado de la orden",
              currentProduct: null,
              currentScannedBarcode: null,
            });
            return;
          }
        }

        set({ currentProduct: product, loading: false, step: "scanning" });
      } else {
        set({
          currentProduct: null,
          loading: false,
          step: "product-form",
          error: null, // No es error, es flujo normal
        });
      }
    } catch (error: any) {
      set({
        loading: false,
        error: error.message || "Error al buscar el producto",
        step: "scanning",
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

  addProductToEntry: async (product, quantity, barcode) => {
    const {
      entryItems,
      purchaseOrderId,
      selectedOrderProductId,
      entryType,
      scannedItemsProgress,
    } = get();

    // Si hay una orden de compra, validar que el producto esté en la orden
    if (purchaseOrderId && entryType === "PO_ENTRY") {
      // Validar contra la orden usando la nueva función
      const validation = get().validateProductAgainstOrder(
        product.id,
        quantity
      );
      if (!validation.valid) {
        set({ error: validation.error });
        return;
      }

      // Validar que el producto escaneado sea el seleccionado de la orden (si hay uno seleccionado)
      if (selectedOrderProductId && selectedOrderProductId !== product.id) {
        set({ error: "Debe escanear el producto seleccionado de la orden" });
        return;
      }

      // Actualizar progreso de escaneo
      const currentProgress = scannedItemsProgress.get(product.id) || 0;
      const newProgress = new Map(scannedItemsProgress);
      newProgress.set(product.id, currentProgress + quantity);
      set({ scannedItemsProgress: newProgress });
    }

    // Verificar si el producto ya está en la lista
    const existingIndex = entryItems.findIndex(
      (item) => item.product.id === product.id
    );

    if (existingIndex >= 0) {
      // Si existe, actualizar la cantidad
      const updatedItems = [...entryItems];
      updatedItems[existingIndex].quantity += quantity;
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

  updateProductQuantity: (index, quantity) => {
    const { entryItems, purchaseOrderId, entryType, scannedItemsProgress } =
      get();

    const item = entryItems[index];
    if (!item) return;

    // Validar cantidad
    if (quantity <= 0) {
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

    // Si hay orden de compra y la cantidad aumenta, validar contra la orden
    if (purchaseOrderId && entryType === "PO_ENTRY" && delta > 0) {
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
  ): Promise<{ product: Product | null; error: any }> => {
    try {
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: productData.name,
          sku: productData.sku,
          barcode: productData.barcode,
          category_id: productData.category_id,
          brand_id: productData.brand_id,
          description: productData.description || null,
          status: true,
        })
        .select()
        .single();

      if (error) {
        return { product: null, error };
      }

      // Si hay supplier_id, crear relación en product_suppliers
      if (productData.supplier_id) {
        await supabase.from("product_suppliers").insert({
          product_id: data.id,
          supplier_id: productData.supplier_id,
        });
      }

      return { product: data as Product, error: null };
    } catch (error: any) {
      return { product: null, error };
    }
  },

  // Finalize entry
  finalizeEntry: async (userId): Promise<{ error: any }> => {
    const {
      entryItems,
      supplierId,
      purchaseOrderId,
      warehouseId,
      entryType,
      selectedPurchaseOrder,
    } = get();

    if (entryItems.length === 0) {
      return { error: { message: "No hay productos para registrar" } };
    }

    if (!warehouseId) {
      return { error: { message: "Debe seleccionar una bodega" } };
    }

    if (!entryType) {
      return { error: { message: "Tipo de entrada no definido" } };
    }

    if (!userId) {
      return { error: { message: "Usuario no autenticado" } };
    }

    // Validación adicional para entradas con orden de compra
    if (entryType === "PO_ENTRY" && !supplierId) {
      return {
        error: {
          message:
            "Debe seleccionar un proveedor para entrada con orden de compra",
        },
      };
    }

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

        if (item.quantity <= 0) {
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

      // 2. Validar bodega activa
      if (!warehouseId) {
        return { valid: false, message: "Debe seleccionar una bodega" };
      }

      const { data: warehouseData, error: warehouseError } = await supabase
        .from("warehouses")
        .select("id, is_active")
        .eq("id", warehouseId)
        .maybeSingle();

      if (warehouseError) {
        console.error("Error validating warehouse:", warehouseError);
        return {
          valid: false,
          message: "Error al validar la bodega seleccionada.",
        };
      }

      if (!warehouseData || !warehouseData.is_active) {
        return {
          valid: false,
          message:
            "La bodega seleccionada no está activa. Por favor seleccione otra bodega.",
        };
      }

      // 3. Validar que los productos no estén eliminados
      const productIds = entryItems.map((item) => item.product.id);
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, deleted_at")
        .in("id", productIds);

      if (productsError) {
        console.error("Error validating products:", productsError);
        return {
          valid: false,
          message: "Error al validar los productos de la entrada.",
        };
      }

      const deletedProducts =
        productsData?.filter((p) => p.deleted_at !== null) || [];
      if (deletedProducts.length > 0) {
        return {
          valid: false,
          message:
            "Uno o más productos de la entrada han sido eliminados. Por favor actualice la página y revise la orden.",
        };
      }

      // 4. Validación específica de orden de compra si aplica
      if (entryType === "PO_ENTRY" && purchaseOrderId) {
        // Validar estado de la orden directamente en BD
        const { data: orderData, error: orderError } = await supabase
          .from("purchase_orders")
          .select("status")
          .eq("id", purchaseOrderId)
          .maybeSingle();

        if (orderError) {
          console.error("Error validating purchase order:", orderError);
          return {
            valid: false,
            message: "Error al validar el estado de la orden de compra.",
          };
        }

        if (!orderData) {
          return {
            valid: false,
            message:
              "La orden de compra seleccionada ya no está disponible. Por favor recargue la pantalla.",
          };
        }

        if (orderData.status !== "pending") {
          return {
            valid: false,
            message:
              "La orden de compra no está en estado pendiente. No se pueden registrar más entradas.",
          };
        }

        // Validar que las cantidades totales de la sesión no excedan lo permitido en la orden
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
                registeredEntriesCache[purchaseOrderId]?.[
                  orderItem.product_id
                ] || 0;
              const totalAfterSession = registeredInBD + sessionQty;

              if (totalAfterSession > orderItem.quantity) {
                const pending =
                  orderItem.quantity - registeredInBD > 0
                    ? orderItem.quantity - registeredInBD
                    : 0;

                return {
                  valid: false,
                  message: `La cantidad excede lo pendiente para el producto ${orderItem.product_id}. Cantidad en orden: ${orderItem.quantity}, ya registrado: ${registeredInBD}, pendiente: ${pending}, intentando registrar en esta sesión: ${sessionQty}.`,
                };
              }
            }
          }
        }
      }

      return { valid: true };
    };

    const validationResult = await validateEntryDataBeforeInsert();
    if (!validationResult.valid) {
      return { error: { message: validationResult.message } };
    }

    try {
      // Registrar cada producto en inventory_entries
      const entries: InventoryEntry[] = entryItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        supplier_id: supplierId,
        purchase_order_id: purchaseOrderId,
        warehouse_id: warehouseId,
        barcode_scanned: item.barcode,
        entry_type: entryType, // Usar el tipo seleccionado explícitamente
        created_by: userId,
      }));

      const { error: entriesError } = await supabase
        .from("inventory_entries")
        .insert(entries);

      if (entriesError) {
        return { error: entriesError };
      }

      // NOTA: No actualizamos warehouse_stock manualmente aquí porque
      // probablemente hay un trigger en la base de datos que lo hace automáticamente
      // al insertar en inventory_entries. Si se actualiza manualmente aquí también,
      // se duplicaría el incremento del stock.

      // Actualizar el cache de entradas registradas inmediatamente
      if (purchaseOrderId) {
        const { registeredEntriesCache } = get();
        const updatedCache = { ...registeredEntriesCache };

        if (!updatedCache[purchaseOrderId]) {
          updatedCache[purchaseOrderId] = {};
        }

        // Agregar las cantidades recién registradas al cache
        entryItems.forEach((item) => {
          const currentQty =
            updatedCache[purchaseOrderId][item.product.id] || 0;
          updatedCache[purchaseOrderId][item.product.id] =
            currentQty + item.quantity;
        });

        set({ registeredEntriesCache: updatedCache });
      }

      // Guardar las órdenes antes de resetear
      const currentPurchaseOrders = get().purchaseOrders;

      // NOTA: No llamamos validateAllPurchaseOrders aquí porque:
      // 1. Ya actualizamos el cache manualmente arriba (líneas 1368-1376)
      // 2. validateAllPurchaseOrders consultaría toda la BD y sobrescribiría el cache
      // 3. Esto causaría recálculos innecesarios y posibles inconsistencias
      // Si se necesitan actualizar las validaciones, se pueden actualizar solo para esta orden
      // o esperar a que el usuario recargue las órdenes

      // Resetear todo después de finalizar (excepto las validaciones y cache que se actualizaron)
      const updatedValidations = get().purchaseOrderValidations;
      const updatedCache = get().registeredEntriesCache;
      get().reset();

      // Restaurar las órdenes, validaciones y cache actualizados
      set({
        purchaseOrders: currentPurchaseOrders,
        purchaseOrderValidations: updatedValidations,
        registeredEntriesCache: updatedCache,
      });

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  },

  // Reset actions
  reset: () => {
    set({
      entryItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      error: null,
      step: "flow-selection",
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

  resetCurrentScan: () => {
    set({
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      step: "scanning",
    });
  },

  clearError: () => {
    set({ error: null });
  },

  goBackToSetup: () => {
    set({
      step: "setup", // Regresar al setup del flujo actual
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      error: null,
      // No limpiar scannedItemsProgress para mantener el progreso visible
    });
  },
}));
