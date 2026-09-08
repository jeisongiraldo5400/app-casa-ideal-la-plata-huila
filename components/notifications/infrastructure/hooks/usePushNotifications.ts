import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { buildPushDeepLink } from '@/lib/notifications/pushDeepLink';
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

  // 1. Registro del token.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    let cancelled = false;
    const register = async () => {
      const now = Date.now();
      if (now - lastRegisterAt.current < REGISTER_THROTTLE_MS) return;
      lastRegisterAt.current = now;
      await registerPushDevice();
    };

    void register();

    // El permiso se puede conceder o revocar desde los ajustes del sistema sin
    // pasar por la app, así que se revisa al volver al primer plano.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !cancelled) void register();
    });

    // El sistema puede rotar el token; hay que volver a subirlo.
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      lastRegisterAt.current = 0;
      if (!cancelled) void register();
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
      const route = buildPushDeepLink(data as Record<string, unknown> | null);
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
