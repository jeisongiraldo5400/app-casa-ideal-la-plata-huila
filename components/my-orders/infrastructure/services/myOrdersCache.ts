import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingDeliveryOrder } from './myOrdersService';

/**
 * Última lista de «Mis órdenes · Pendientes» que llegó del servidor, guardada
 * en el teléfono para verla sin señal.
 *
 * Esas órdenes salen de un RPC por asignación (`get_my_authorized_delivery_orders`)
 * que no viaja en la descarga; sin esta copia, al quedarse sin señal la
 * pestaña mostraba el error de red y nada más. Es por usuario: si en el
 * teléfono entra otra persona no ve la lista de la anterior. Se borra con el
 * resto de datos locales al cerrar sesión (`wipeLocalOfflineData`).
 */
const MY_PENDING_ORDERS_KEY = '@casa_ideal/my_pending_delivery_orders';

type Stored = { userId: string; savedAt: number; orders: PendingDeliveryOrder[] };

export type CachedPendingOrders = { orders: PendingDeliveryOrder[]; savedAt: number };

export async function saveCachedPendingOrders(
  userId: string | null,
  orders: PendingDeliveryOrder[],
  now = Date.now()
): Promise<void> {
  if (!userId) return;
  try {
    const value: Stored = { userId, savedAt: now, orders };
    await AsyncStorage.setItem(MY_PENDING_ORDERS_KEY, JSON.stringify(value));
  } catch {
    // Guardar la copia es un extra: si falla, la pantalla sigue igual.
  }
}

export async function readCachedPendingOrders(userId: string | null): Promise<CachedPendingOrders | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(MY_PENDING_ORDERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed.userId !== userId || !Array.isArray(parsed.orders)) return null;
    return { orders: parsed.orders, savedAt: Number(parsed.savedAt) || 0 };
  } catch {
    return null;
  }
}

export async function clearCachedPendingOrders(): Promise<void> {
  await AsyncStorage.removeItem(MY_PENDING_ORDERS_KEY);
}
