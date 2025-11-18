import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';

/**
 * Hook personalizado para acceder al estado y funciones del módulo de entradas
 */
export function useEntries() {
  return useEntriesStore();
}

