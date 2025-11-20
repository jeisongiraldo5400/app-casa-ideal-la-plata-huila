import { supabase } from '@/lib/supabase';
import { create } from 'zustand';
import { Database } from '@/types/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Warehouse = Database['public']['Tables']['warehouses']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type InventoryExit = Database['public']['Tables']['inventory_exits']['Row'];

export interface ExitListItem {
  id: string;
  product: Product;
  warehouse: Warehouse;
  quantity: number;
  created_at: string;
  created_by: string | null;
  creator: Profile | null;
  barcode_scanned: string | null;
}

interface ExitsListState {
  exits: ExitListItem[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  loadExits: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useExitsListStore = create<ExitsListState>((set, get) => ({
  exits: [],
  loading: false,
  error: null,
  searchQuery: '',

  loadExits: async () => {
    set({ loading: true, error: null });

    try {
      // Consulta con joins usando foreign keys
      const { data, error } = await supabase
        .from('inventory_exits')
        .select(`
          *,
          products(*),
          warehouses(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading exits:', error);
        set({ exits: [], loading: false, error: error.message });
        return;
      }

      // Obtener todos los IDs únicos de creadores
      const creatorIds = [...new Set((data || []).map((item: any) => item.created_by).filter(Boolean))];
      
      // Cargar todos los perfiles de una vez
      let profilesMap = new Map<string, Profile>();
      if (creatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', creatorIds);
        
        if (profilesData) {
          profilesData.forEach((profile) => {
            profilesMap.set(profile.id, profile);
          });
        }
      }

      // Procesar datos y asignar creadores
      const exitsWithCreators = (data || []).map((item: any) => {
        const creator = item.created_by ? profilesMap.get(item.created_by) || null : null;

        return {
          id: item.id,
          product: item.products,
          warehouse: item.warehouses,
          quantity: item.quantity || 0,
          created_at: item.created_at,
          created_by: item.created_by,
          creator,
          barcode_scanned: item.barcode_scanned,
        } as ExitListItem;
      });

      // Filtrar items con productos válidos
      const validExits = exitsWithCreators.filter(
        (item) => item.product && !item.product.deleted_at && item.warehouse
      );

      set({ exits: validExits, loading: false });
    } catch (error: any) {
      console.error('Error loading exits (catch):', error);
      set({ exits: [], loading: false, error: error.message || 'Error al cargar las salidas' });
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  clearError: () => {
    set({ error: null });
  },
}));

