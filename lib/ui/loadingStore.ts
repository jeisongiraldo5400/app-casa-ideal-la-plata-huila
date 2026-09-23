import { create } from 'zustand';

/**
 * Estado de "la app está ocupada" compartido por toda la interfaz.
 *
 * Por qué existe: al tocar una opción del menú la pantalla destino monta rápido
 * pero se queda en blanco mientras pide datos al servidor (red irregular en
 * campo). El usuario cree que no pasó nada y vuelve a tocar. Con un único punto
 * de verdad, `GlobalLoadingBar` puede avisar desde el toque hasta que el
 * destino termina de cargar, sin que cada pantalla invente su propio aviso.
 *
 * Dos fuentes se suman:
 *  - `navigating`: desde que se toca el menú hasta que la ruta destino monta.
 *  - `loaders`: pantallas que declararon que están cargando datos
 *    (`useScreenLoading`), identificadas para soportar varias a la vez.
 */

/** Espera antes de pintar el aviso: evita el parpadeo en cargas muy rápidas. */
export const LOADING_SHOW_DELAY_MS = 200;

/**
 * Tope de seguridad de la navegación. Si el destino nunca monta (ruta
 * inexistente, error al renderizar), el aviso no puede quedarse encendido.
 */
export const NAVIGATION_TIMEOUT_MS = 8000;

interface LoadingState {
  /** Hay una navegación en curso a la espera de que monte la pantalla destino. */
  navigating: boolean;
  /** Identificadores de las pantallas que están cargando datos ahora mismo. */
  loaders: string[];
  startNavigation: () => void;
  endNavigation: () => void;
  setScreenLoading: (id: string, loading: boolean) => void;
  /** Solo para pruebas y para el cierre de sesión: deja el aviso apagado. */
  reset: () => void;
}

let navigationFailsafe: ReturnType<typeof setTimeout> | null = null;

function clearFailsafe() {
  if (navigationFailsafe) {
    clearTimeout(navigationFailsafe);
    navigationFailsafe = null;
  }
}

export const useLoadingStore = create<LoadingState>((set, get) => ({
  navigating: false,
  loaders: [],
  startNavigation: () => {
    clearFailsafe();
    navigationFailsafe = setTimeout(() => get().endNavigation(), NAVIGATION_TIMEOUT_MS);
    set({ navigating: true });
  },
  endNavigation: () => {
    clearFailsafe();
    // Comparar antes de escribir evita re-render en cada cambio de ruta cuando
    // la navegación la disparó el sistema (gesto de volver, enlace profundo).
    if (get().navigating) set({ navigating: false });
  },
  setScreenLoading: (id, loading) =>
    set((state) => {
      const registered = state.loaders.includes(id);
      if (loading === registered) return state;
      return {
        loaders: loading ? [...state.loaders, id] : state.loaders.filter((item) => item !== id),
      };
    }),
  reset: () => {
    clearFailsafe();
    set({ navigating: false, loaders: [] });
  },
}));

/** Selector único: la app está ocupada si navega o si alguna pantalla carga. */
export const selectIsBusy = (state: LoadingState) => state.navigating || state.loaders.length > 0;

/**
 * Marca el inicio de una navegación desde fuera de React (barra de pestañas,
 * manejadores sueltos). `GlobalLoadingBar` la cierra cuando cambia la ruta.
 */
export function startNavigationLoading() {
  useLoadingStore.getState().startNavigation();
}
