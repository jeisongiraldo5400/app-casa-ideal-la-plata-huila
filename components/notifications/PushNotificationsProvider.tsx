import { type ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { usePushNotifications } from './infrastructure/hooks/usePushNotifications';

/**
 * Con la app en primer plano el sistema no muestra nada por su cuenta: hay que
 * pedirlo aquí. Se muestra banner y entrada en el centro de notificaciones, con
 * sonido, pero sin globo en el icono: el número de pendientes no lo lleva nadie
 * y un globo que nunca baja se vuelve ruido.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  usePushNotifications();
  return <>{children}</>;
}
