import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/database.types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];
type InventoryExit = Database["public"]["Tables"]["inventory_exits"]["Insert"];

export interface ExitItem {
  product: Product;
  quantity: number;
  barcode: string;
  availableStock?: number; // Stock disponible en la bodega
}

interface ExitsState {
  // Sesión de salida
  warehouseId: string | null;
  exitItems: ExitItem[];

  // Estado actual de escaneo
  currentProduct: Product | null;
  currentScannedBarcode: string | null;
  currentQuantity: number;
  currentAvailableStock: number;

  // Estado de UI
  loading: boolean;
  error: string | null;
  step: "setup" | "scanning"; // setup: seleccionar bodega, scanning: escaneando

  // Datos para formularios
  warehouses: Warehouse[];

  // Actions - Setup
  setWarehouse: (warehouseId: string | null) => void;
  loadWarehouses: () => Promise<void>;
  startExit: () => void;

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
  currentProduct: null,
  currentScannedBarcode: null,
  currentQuantity: 1,
  currentAvailableStock: 0,
  loading: false,
  error: null,
  step: "setup",
  warehouses: [],

  // Setup actions
  setWarehouse: (warehouseId) => {
    set({ warehouseId });
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

  startExit: () => {
    const { warehouseId } = get();
    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
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

      // Verificar stock disponible en la bodega seleccionada
      const { warehouseId } = get();
      if (!warehouseId) {
        set({
          loading: false,
          error: "Debe seleccionar una bodega primero",
          currentProduct: null,
          currentScannedBarcode: null, // Limpiar para permitir escanear de nuevo
        });
        return;
      }

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
    const { exitItems, warehouseId, currentProduct, currentAvailableStock } = get();

    if (!warehouseId) {
      set({ error: "Debe seleccionar una bodega" });
      return;
    }

    if (quantity <= 0) {
      set({ error: "La cantidad debe ser mayor a 0" });
      return;
    }

    // OPTIMIZADO: Reutilizar stock cacheado si es el mismo producto recién escaneado
    // Esto evita una consulta duplicada a la base de datos
    let availableStock: number | null = null;
    
    if (currentProduct?.id === product.id && currentAvailableStock !== undefined) {
      // Reutilizar stock cacheado del escaneo reciente
      availableStock = currentAvailableStock;
    } else {
      // Solo consultar si no está cacheado
      const { data: stock, error: stockError } = await supabase
        .from("warehouse_stock")
        .select("quantity")
        .eq("product_id", product.id)
        .eq("warehouse_id", warehouseId)
        .single();

      availableStock = stock?.quantity || 0;
      
      if (stockError) {
        console.error("Error loading stock:", stockError);
      }
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
    const { exitItems, warehouseId } = get();

    if (exitItems.length === 0) {
      return { error: { message: "No hay productos para registrar" } };
    }

    if (!warehouseId) {
      return { error: { message: "Debe seleccionar una bodega" } };
    }

    try {
      // Registrar cada producto en inventory_exits
      const exits: InventoryExit[] = exitItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        warehouse_id: warehouseId,
        barcode_scanned: item.barcode,
        created_by: userId,
      }));

      const { error: exitsError } = await supabase
        .from("inventory_exits")
        .insert(exits);

      if (exitsError) {
        return { error: exitsError };
      }

      // NOTA: El trigger de la base de datos maneja la actualización del stock
      // al insertar en inventory_exits

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

