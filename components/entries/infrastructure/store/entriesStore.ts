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

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: (PurchaseOrderItem & { product: Product })[];
}

interface EntriesState {
  // Sesión de entrada
  entryType: EntryType | null;
  supplierId: string | null;
  purchaseOrderId: string | null;
  warehouseId: string | null;
  entryItems: EntryItem[];

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
  purchaseOrderValidations: Record<string, {
    isComplete: boolean;
    totalQuantityOfInventoryEntries: number;
    totalItemsQuantity: number;
  }>;

  // Actions - Setup
  setEntryType: (type: EntryType) => void;
  setSupplier: (supplierId: string | null) => void;
  setPurchaseOrder: (purchaseOrderId: string | null) => void;
  setWarehouse: (warehouseId: string | null) => void;
  setSetupStep: (step: "supplier" | "purchase-order" | "warehouse") => void;
  setSupplierSearchQuery: (query: string) => void;
  loadSuppliers: () => Promise<void>;
  loadPurchaseOrders: (supplierId: string) => Promise<void>;
  validatePurchaseOrderProgress: (purchaseOrderId: string) => Promise<void>;
  validateAllPurchaseOrders: () => Promise<void>;
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
  ) => void;
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
  warehouseId: null,
  entryItems: [],
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

  setPurchaseOrder: (purchaseOrderId) => {
    set({ purchaseOrderId });
    if (purchaseOrderId) {
      get().setSetupStep("warehouse");
    }
  },

  setWarehouse: (warehouseId) => {
    set({ warehouseId });
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

      // Para cada orden, cargar sus items con los productos
      const ordersWithItems: PurchaseOrderWithItems[] = await Promise.all(
        (orders || []).map(async (order) => {
          const { data: items, error: itemsError } = await supabase
            .from("purchase_order_items")
            .select(
              `
              *,
              products(*)
            `
            )
            .eq("purchase_order_id", order.id);

          if (itemsError) {
            console.error("Error loading purchase order items:", itemsError);
            return { ...order, items: [] };
          }

          return {
            ...order,
            items: (items || []).map((item: any) => ({
              ...item,
              product: item.products,
            })) as (PurchaseOrderItem & { product: Product })[],
          };
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

      // Calcular la cantidad total registrada
      const totalQuantityOfInventoryEntries = (data || []).reduce(
        (acc, curr) => acc + curr.quantity,
        0
      );

      // Actualizar el estado de validación para esta orden específica
      const validations = get().purchaseOrderValidations;
      set({ 
        purchaseOrderValidations: {
          ...validations,
          [purchaseOrderId]: {
            isComplete: totalQuantityOfInventoryEntries >= totalItemsQuantity && totalItemsQuantity > 0,
            totalQuantityOfInventoryEntries,
            totalItemsQuantity,
          },
        },
      });

      console.log("Purchase order validation:", {
        purchaseOrderId,
        totalQuantityOfInventoryEntries,
        totalItemsQuantity,
        isComplete: totalQuantityOfInventoryEntries >= totalItemsQuantity && totalItemsQuantity > 0,
      });
    } catch (error: any) {
      console.error("Error validating purchase order progress:", error);
    }
  },

  validateAllPurchaseOrders: async (): Promise<void> => {
    const { purchaseOrders } = get();
    
    // Validar todas las órdenes en paralelo
    await Promise.all(
      purchaseOrders.map((order) => 
        get().validatePurchaseOrderProgress(order.id)
      )
    );
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
    const { supplierId, warehouseId, entryType } = get();

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

  addProductToEntry: (product, quantity, barcode) => {
    const { entryItems } = get();
    // Verificar si el producto ya está en la lista
    const existingIndex = entryItems.findIndex(
      (item) => item.product.id === product.id
    );

    if (existingIndex >= 0) {
      // Si existe, actualizar la cantidad
      const updatedItems = [...entryItems];
      updatedItems[existingIndex].quantity += quantity;
      set({ entryItems: updatedItems });
    } else {
      // Si no existe, agregarlo
      set({ entryItems: [...entryItems, { product, quantity, barcode }] });
    }

    // Resetear el escaneo actual
    get().resetCurrentScan();
  },

  removeProductFromEntry: (index) => {
    const { entryItems } = get();
    const updatedItems = entryItems.filter((_, i) => i !== index);
    set({ entryItems: updatedItems });
  },

  updateProductQuantity: (index, quantity) => {
    const { entryItems } = get();
    const updatedItems = [...entryItems];
    updatedItems[index].quantity = quantity;
    set({ entryItems: updatedItems });
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
    const { entryItems, supplierId, purchaseOrderId, warehouseId, entryType } =
      get();

    if (entryItems.length === 0) {
      return { error: { message: "No hay productos para registrar" } };
    }

    if (!warehouseId) {
      return { error: { message: "Debe seleccionar una bodega" } };
    }

    if (!entryType) {
      return { error: { message: "Tipo de entrada no definido" } };
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

      // Guardar las órdenes antes de resetear
      const currentPurchaseOrders = get().purchaseOrders;

      // Revalidar todas las órdenes después de registrar la entrada
      if (currentPurchaseOrders.length > 0) {
        await get().validateAllPurchaseOrders();
      }

      // Resetear todo después de finalizar (excepto las validaciones que se actualizaron)
      const updatedValidations = get().purchaseOrderValidations;
      get().reset();
      
      // Restaurar las órdenes y validaciones actualizadas
      set({ 
        purchaseOrders: currentPurchaseOrders,
        purchaseOrderValidations: updatedValidations,
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
      warehouseId: null,
      purchaseOrders: [],
      supplierSearchQuery: "",
      purchaseOrderValidations: {},
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
    });
  },
}));
