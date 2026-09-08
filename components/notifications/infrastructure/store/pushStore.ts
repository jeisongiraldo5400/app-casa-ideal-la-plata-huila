import { create } from 'zustand';

/**
 * Ruta pendiente de abrir por una notificación.
 *
 * No se navega desde el listener directamente: cuando la app arranca en frío
 * porque el usuario tocó el aviso, el Stack todavía no está montado y el
 * `router.push` se pierde. Se guarda aquí y la pantalla raíz la consume cuando
 * hay sesión y el árbol de navegación existe.
 */
type PushState = {
  pendingRoute: string | null;
  setPendingRoute: (route: string | null) => void;
  consumePendingRoute: () => string | null;
};

export const usePushStore = create<PushState>((set, get) => ({
  pendingRoute: null,
  setPendingRoute: (pendingRoute) => set({ pendingRoute }),
  consumePendingRoute: () => {
    const route = get().pendingRoute;
    if (route) set({ pendingRoute: null });
    return route;
  },
}));
