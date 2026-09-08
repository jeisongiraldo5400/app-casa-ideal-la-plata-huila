import { useShallow } from 'zustand/react/shallow';
import { useExitsStore, type ExitsState } from '../store/exitsStore';

/**
 * Acceso al store de salidas con selector y comparación superficial: el componente
 * solo se vuelve a renderizar cuando cambia alguno de los campos que pide.
 */
export function useExits<T>(selector: (state: ExitsState) => T): T {
  return useExitsStore(useShallow(selector));
}
