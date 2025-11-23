import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface ReportData {
  entriesVsExits: {
    date: string;
    entries: number;
    exits: number;
  }[];
  topProducts: {
    productId: string;
    productName: string;
    entries: number;
    exits: number;
    total: number;
  }[];
  entriesBySupplier: {
    supplierId: string;
    supplierName: string;
    quantity: number;
  }[];
  exitsByWarehouse: {
    warehouseId: string;
    warehouseName: string;
    quantity: number;
  }[];
  entriesByType: {
    type: string;
    quantity: number;
  }[];
}

interface ReportsState {
  loading: boolean;
  error: string | null;
  reportData: ReportData | null;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  setDateRange: (startDate: Date, endDate: Date) => void;
  loadReports: () => Promise<void>;
  clearError: () => void;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  loading: false,
  error: null,
  reportData: null,
  dateRange: {
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // Últimos 30 días
    endDate: new Date(),
  },

  setDateRange: (startDate: Date, endDate: Date) => {
    set({ dateRange: { startDate, endDate } });
  },

  clearError: () => {
    set({ error: null });
  },

  loadReports: async () => {
    set({ loading: true, error: null });

    try {
      const { startDate, endDate } = get().dateRange;
      
      // Validar fechas
      if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Fechas inválidas');
      }

      if (startDate > endDate) {
        throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
      }

      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      // 1. Entradas vs Salidas por día
      const { data: entriesData, error: entriesError } = await supabase
        .from('inventory_entries')
        .select('created_at, quantity')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: true });

      const { data: exitsData, error: exitsError } = await supabase
        .from('inventory_exits')
        .select('created_at, quantity')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: true });

      if (entriesError || exitsError) {
        throw new Error(entriesError?.message || exitsError?.message || 'Error al cargar datos');
      }

      // Agrupar por día
      const entriesByDay = new Map<string, number>();
      const exitsByDay = new Map<string, number>();

      (entriesData || []).forEach((entry) => {
        try {
          if (!entry.created_at) return;
          const date = new Date(entry.created_at);
          if (isNaN(date.getTime())) return;
          const dateStr = date.toISOString().split('T')[0];
          const current = entriesByDay.get(dateStr) || 0;
          entriesByDay.set(dateStr, current + (Number(entry.quantity) || 0));
        } catch (error) {
          console.warn('Error processing entry date:', error);
        }
      });

      (exitsData || []).forEach((exit) => {
        try {
          if (!exit.created_at) return;
          const date = new Date(exit.created_at);
          if (isNaN(date.getTime())) return;
          const dateStr = date.toISOString().split('T')[0];
          const current = exitsByDay.get(dateStr) || 0;
          exitsByDay.set(dateStr, current + (Number(exit.quantity) || 0));
        } catch (error) {
          console.warn('Error processing exit date:', error);
        }
      });

      // Combinar todas las fechas
      const allDates = new Set([...entriesByDay.keys(), ...exitsByDay.keys()]);
      const entriesVsExits = Array.from(allDates)
        .sort()
        .map((date) => ({
          date,
          entries: entriesByDay.get(date) || 0,
          exits: exitsByDay.get(date) || 0,
        }));

      // 2. Top productos más movidos
      const { data: allEntries, error: entriesProductsError } = await supabase
        .from('inventory_entries')
        .select('product_id, quantity, products(name)')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      const { data: allExits, error: exitsProductsError } = await supabase
        .from('inventory_exits')
        .select('product_id, quantity, products(name)')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      if (entriesProductsError || exitsProductsError) {
        throw new Error(entriesProductsError?.message || exitsProductsError?.message || 'Error al cargar productos');
      }

      const productMap = new Map<string, { productId: string; productName: string; entries: number; exits: number }>();

      (allEntries || []).forEach((entry: any) => {
        const productId = entry.product_id;
        const current = productMap.get(productId) || {
          productId,
          productName: entry.products?.name || 'Producto desconocido',
          entries: 0,
          exits: 0,
        };
        current.entries += entry.quantity || 0;
        productMap.set(productId, current);
      });

      (allExits || []).forEach((exit: any) => {
        const productId = exit.product_id;
        const current = productMap.get(productId) || {
          productId,
          productName: exit.products?.name || 'Producto desconocido',
          entries: 0,
          exits: 0,
        };
        current.exits += exit.quantity || 0;
        productMap.set(productId, current);
      });

      const topProducts = Array.from(productMap.values())
        .map((p) => ({
          ...p,
          total: p.entries + p.exits,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10); // Top 10

      // 3. Entradas por proveedor
      const { data: entriesBySupplierData, error: supplierError } = await supabase
        .from('inventory_entries')
        .select(`
          supplier_id,
          quantity,
          suppliers:supplier_id (
            id,
            name
          )
        `)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .not('supplier_id', 'is', null);

      if (supplierError) {
        throw new Error(supplierError.message || 'Error al cargar proveedores');
      }

      const supplierMap = new Map<string, { supplierId: string; supplierName: string; quantity: number }>();

      (entriesBySupplierData || []).forEach((entry: any) => {
        if (!entry.supplier_id) return;
        const supplier = Array.isArray(entry.suppliers) ? entry.suppliers[0] : entry.suppliers;
        const current = supplierMap.get(entry.supplier_id) || {
          supplierId: entry.supplier_id,
          supplierName: supplier?.name || 'Proveedor desconocido',
          quantity: 0,
        };
        current.quantity += entry.quantity || 0;
        supplierMap.set(entry.supplier_id, current);
      });

      const entriesBySupplier = Array.from(supplierMap.values()).sort((a, b) => b.quantity - a.quantity);

      // 4. Salidas por bodega
      const { data: exitsByWarehouseData, error: warehouseError } = await supabase
        .from('inventory_exits')
        .select('warehouse_id, quantity, warehouses(name)')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      if (warehouseError) {
        throw new Error(warehouseError.message || 'Error al cargar bodegas');
      }

      const warehouseMap = new Map<string, { warehouseId: string; warehouseName: string; quantity: number }>();

      (exitsByWarehouseData || []).forEach((exit: any) => {
        const current = warehouseMap.get(exit.warehouse_id) || {
          warehouseId: exit.warehouse_id,
          warehouseName: exit.warehouses?.name || 'Bodega desconocida',
          quantity: 0,
        };
        current.quantity += exit.quantity || 0;
        warehouseMap.set(exit.warehouse_id, current);
      });

      const exitsByWarehouse = Array.from(warehouseMap.values()).sort((a, b) => b.quantity - a.quantity);

      // 5. Entradas por tipo
      const { data: entriesByTypeData, error: typeError } = await supabase
        .from('inventory_entries')
        .select('entry_type, quantity')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      if (typeError) {
        throw new Error(typeError.message || 'Error al cargar tipos');
      }

      const typeMap = new Map<string, number>();

      (entriesByTypeData || []).forEach((entry) => {
        const type = entry.entry_type || 'ENTRY';
        const current = typeMap.get(type) || 0;
        typeMap.set(type, current + (entry.quantity || 0));
      });

      const entriesByType = Array.from(typeMap.entries()).map(([type, quantity]) => ({
        type,
        quantity,
      }));

      set({
        reportData: {
          entriesVsExits,
          topProducts,
          entriesBySupplier,
          exitsByWarehouse,
          entriesByType,
        },
        loading: false,
      });
    } catch (error: any) {
      console.error('Error loading reports:', error);
      set({
        error: error.message || 'Error al cargar reportes',
        loading: false,
      });
    }
  },
}));

