import { useShallow } from 'zustand/react/shallow';
import { useEntriesStore, type EntriesState } from '@/components/entries/infrastructure/store/entriesStore';

/**
 * Acceso al store de entradas con selector y comparación superficial: el componente
 * solo se vuelve a renderizar cuando cambia alguno de los campos que pide.
 */
export function useEntries<T>(selector: (state: EntriesState) => T): T {
  return useEntriesStore(useShallow(selector));
}
