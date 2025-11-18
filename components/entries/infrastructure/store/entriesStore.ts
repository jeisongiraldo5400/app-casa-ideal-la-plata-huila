import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { create } from 'zustand';

type Product = Database['public']['Tables']['products']['Row'];
type Supplier = Database['public']['Tables']['suppliers']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];
type Category = Database['public']['Tables']['category']['Row'];
type Brand = Database['public']['Tables']['brands']['Row'];
type InventoryEntry = Database['public']['Tables']['inventory_entries']['Insert'];

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

interface EntriesState {
  // Sesión de entrada
  supplierId: string | null;
  warehouseId: string | null;
  entryItems: EntryItem[];
  
  // Estado actual de escaneo
  currentProduct: Product | null;
  currentScannedBarcode: string | null;
  currentQuantity: number;
  
  // Estado de UI
  loading: boolean;
  error: string | null;
  step: 'setup' | 'scanning' | 'product-form'; // setup: seleccionar supplier/warehouse, scanning: escaneando, product-form: crear producto
  
  // Datos para formularios
  suppliers: Supplier[];
  warehouses: Warehouse[];
  categories: Category[];
  brands: Brand[];
  
  // Actions - Setup
  setSupplier: (supplierId: string | null) => void;
  setWarehouse: (warehouseId: string | null) => void;
  loadSuppliers: () => Promise<void>;
  loadWarehouses: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadBrands: () => Promise<void>;
  startEntry: () => void;
  
  // Actions - Scanning
  scanBarcode: (barcode: string) => Promise<void>;
  searchProductByBarcode: (barcode: string) => Promise<Product | null>;
  addProductToEntry: (product: Product, quantity: number, barcode: string) => void;
  removeProductFromEntry: (index: number) => void;
  updateProductQuantity: (index: number, quantity: number) => void;
  setQuantity: (quantity: number) => void;
  
  // Actions - Product Creation
  createProduct: (productData: NewProductData) => Promise<{ product: Product | null; error: any }>;
  
  // Actions - Finalize
  finalizeEntry: (userId: string) => Promise<{ error: any }>;
  
  // Actions - Reset
  reset: () => void;
  clearError: () => void;
  resetCurrentScan: () => void;
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  // Initial state
  supplierId: null,
  warehouseId: null,
  entryItems: [],
  currentProduct: null,
  currentScannedBarcode: null,
  currentQuantity: 1,
  loading: false,
  error: null,
  step: 'setup',
  suppliers: [],
  warehouses: [],
  categories: [],
  brands: [],

  // Setup actions
  setSupplier: (supplierId) => {
    set({ supplierId });
  },

  setWarehouse: (warehouseId) => {
    set({ warehouseId });
  },

  loadSuppliers: async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (error) {
        console.error('Error loading suppliers:', error);
        set({ suppliers: [] });
        return;
      }
      set({ suppliers: data || [] });
    } catch (error: any) {
      console.error('Error loading suppliers:', error);
      set({ suppliers: [] });
    }
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

  loadCategories: async () => {
    try {
      const { data, error } = await supabase
        .from('category')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (error) {
        console.error('Error loading categories:', error);
        set({ categories: [] });
        return;
      }
      set({ categories: data || [] });
    } catch (error: any) {
      console.error('Error loading categories:', error);
      set({ categories: [] });
    }
  },

  loadBrands: async () => {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (error) {
        console.error('Error loading brands:', error);
        set({ brands: [] });
        return;
      }
      set({ brands: data || [] });
    } catch (error: any) {
      console.error('Error loading brands:', error);
      set({ brands: [] });
    }
  },

  startEntry: () => {
    const { supplierId, warehouseId } = get();
    if (!supplierId || !warehouseId) {
      set({ error: 'Debe seleccionar proveedor y bodega antes de comenzar' });
      return;
    }
    set({ step: 'scanning', error: null });
  },

  // Scanning actions
  scanBarcode: async (barcode: string) => {
    set({ loading: true, error: null, currentScannedBarcode: barcode, currentQuantity: 1 });
    try {
      const product = await get().searchProductByBarcode(barcode);
      if (product) {
        set({ currentProduct: product, loading: false, step: 'scanning' });
      } else {
        set({ 
          currentProduct: null, 
          loading: false,
          step: 'product-form',
          error: null, // No es error, es flujo normal
        });
      }
    } catch (error: any) {
      set({ 
        loading: false, 
        error: error.message || 'Error al buscar el producto',
        step: 'scanning',
      });
    }
  },

  searchProductByBarcode: async (barcode: string): Promise<Product | null> => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .is('deleted_at', null)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
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

  addProductToEntry: (product, quantity, barcode) => {
    const { entryItems } = get();
    // Verificar si el producto ya está en la lista
    const existingIndex = entryItems.findIndex(item => item.product.id === product.id);
    
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
  createProduct: async (productData): Promise<{ product: Product | null; error: any }> => {
    try {
      const { data, error } = await supabase
        .from('products')
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
        await supabase
          .from('product_suppliers')
          .insert({
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
    const { entryItems, supplierId, warehouseId } = get();
    
    if (entryItems.length === 0) {
      return { error: { message: 'No hay productos para registrar' } };
    }

    if (!warehouseId) {
      return { error: { message: 'Debe seleccionar una bodega' } };
    }

    try {
      // Registrar cada producto en inventory_entries
      const entries: InventoryEntry[] = entryItems.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        barcode_scanned: item.barcode,
        created_by: userId,
      }));

      const { error: entriesError } = await supabase
        .from('inventory_entries')
        .insert(entries);

      if (entriesError) {
        return { error: entriesError };
      }

      // NOTA: No actualizamos warehouse_stock manualmente aquí porque
      // probablemente hay un trigger en la base de datos que lo hace automáticamente
      // al insertar en inventory_entries. Si se actualiza manualmente aquí también,
      // se duplicaría el incremento del stock.

      // Resetear todo después de finalizar
      get().reset();
      
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
      step: 'setup',
    });
  },

  resetCurrentScan: () => {
    set({
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      step: 'scanning',
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
