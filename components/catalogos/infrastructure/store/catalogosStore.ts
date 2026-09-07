import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errorMessage';
import type { PrivateCatalogListItem } from '@/lib/catalogos/types';
import { listPrivateCatalogs } from '../services/catalogsService';

interface CatalogosState {
  list: PrivateCatalogListItem[];
  loading: boolean;
  /** Mensaje del último fallo de `fetchList`; null cuando la carga fue exitosa. */
  error: string | null;
  fetchList: () => Promise<void>;
  /** Quita un catálogo recién archivado sin esperar la recarga. */
  removeFromList: (id: string) => void;
}

/**
 * Solo el listado vive en Zustand (estado de sesión compartido entre la
 * lista y el detalle). El detalle, el selector y el flujo de compartir usan
 * hooks con estado local (AGENTS.md §3).
 */
export const useCatalogosStore = create<CatalogosState>((set) => ({
  list: [],
  loading: false,
  error: null,

  fetchList: async () => {
    set({ loading: true, error: null });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');
      const list = await listPrivateCatalogs(user.id);
      set({ list, error: null });
    } catch (error) {
      // Se conserva la lista anterior: un fallo de red no debe vaciar la pantalla.
      set({ error: errorMessage(error, 'No se pudieron cargar los catálogos') });
    } finally {
      set({ loading: false });
    }
  },

  removeFromList: (id) => set((state) => ({ list: state.list.filter((item) => item.id !== id) })),
}));
