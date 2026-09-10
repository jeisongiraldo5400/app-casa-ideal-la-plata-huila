import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { buildPushDeepLink } from '@/lib/notifications/pushDeepLink';
import { kickNotificationDispatch } from '../services/dispatchNotifications';
import { registerPushDevice } from '../services/pushDeviceService';
import { usePushStore } from '../store/pushStore';

/** Un registro por minuto como mucho: volver al primer plano no debe machacar la base. */
const REGISTER_THROTTLE_MS = 60_000;

/**
 * Registra el dispositivo mientras haya sesión y encamina los toques en las
 * notificaciones. Mismo patrón que `OfflineProvider`: un efecto atado a
 * `[isAuthenticated, user?.id]`, que cubre el login, el arranque en caliente y
 * el cambio de usuario en el mismo teléfono.
 */
export function usePushNotifications() {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const setPendingRoute = usePushStore((state) => state.setPendingRoute);
  const consumePendingRoute = usePushStore((state) => state.consumePendingRoute);
  const pendingRoute = usePushStore((state) => state.pendingRoute);
  const lastRegisterAt = useRef(0);
  const inFlight = useRef(false);
  const lastDeviceToken = useRef<string | null>(null);

  // 1. Registro del token.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    let cancelled = false;
    const register = async () => {
      // Una sola registración a la vez: las llamadas concurrentes se
      // despachaban antes de que el cliente adjuntara la sesión recién creada
      // y llegaban al servidor como anónimas (401).
      if (inFlight.current) return;
      const now = Date.now();
      if (now - lastRegisterAt.current < REGISTER_THROTTLE_MS) return;
      lastRegisterAt.current = now;
      inFlight.current = true;
      try {
        const result = await registerPushDevice();
        // Recién registrado, el teléfono pide el despacho: así recibe de
        // inmediato lo que quedó pendiente mientras aún no figuraba (por
        // ejemplo, una orden creada segundos antes de iniciar sesión).
        if (result.status === 'registered') kickNotificationDispatch();
      } finally {
        inFlight.current = false;
      }
    };

    void register();

    // El permiso se puede conceder o revocar desde los ajustes del sistema sin
    // pasar por la app, así que se revisa al volver al primer plano.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) void register();
    });

    // El sistema puede rotar el token y hay que volver a subirlo. Ojo:
    // `getExpoPushTokenAsync` obtiene el token disparando este mismo evento,
    // así que reaccionar a cada aviso creaba un bucle (una docena de llamadas
    // en el mismo segundo). Solo se re-registra si el token realmente cambió
    // respecto al último visto; la primera vez ya lo sube la registración en
    // curso.
    const tokenSubscription = Notifications.addPushTokenListener((event) => {
      const token = typeof event?.data === 'string' ? event.data : null;
      if (!token || token === lastDeviceToken.current) return;
      const changed = lastDeviceToken.current !== null;
      lastDeviceToken.current = token;
      if (!changed || cancelled) return;
      lastRegisterAt.current = 0;
      void register();
    });

    return () => {
      cancelled = true;
      subscription.remove();
      tokenSubscription.remove();
    };
  }, [isAuthenticated, user?.id]);

  // 2. Toque en la notificación, con la app viva o arrancando en frío.
  useEffect(() => {
    const remember = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification?.request?.content?.data;
      const route = buildPushDeepLink(data as Record<string, unknown> | null, {
        nonce: response?.notification?.request?.identifier,
      });
      if (route) setPendingRoute(route);
    };

    // Arranque en frío: la app se abrió justo por tocar el aviso.
    void Notifications.getLastNotificationResponseAsync().then(remember, () => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener(remember);
    return () => subscription.remove();
  }, [setPendingRoute]);

  // 3. La navegación espera a tener sesión: sin ella el guard del Stack
  //    devolvería al login y la ruta se perdería.
  useEffect(() => {
    if (!isAuthenticated || !pendingRoute) return;
    const route = consumePendingRoute();
    if (route) router.push(route as never);
  }, [isAuthenticated, pendingRoute, consumePendingRoute, router]);
}
