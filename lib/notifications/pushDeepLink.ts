/**
 * Traduce el contenido de una notificación en la ruta que hay que abrir.
 *
 * Función pura y sin dependencias de Expo Router ni de React Native: es la
 * pieza que decide a dónde va el usuario cuando toca el aviso, y la que se
 * cubre con pruebas.
 *
 * Los negocios tienen pantalla de detalle propia (`app/negocio/[id].tsx`), así
 * que se abre directamente. Las órdenes de entrega y de compra solo existen
 * como listas, de modo que se abre la lista correspondiente con el número de
 * orden ya escrito en el buscador: el listado queda filtrado a esa orden y
 * basta con tocarla para ver el detalle. Es lo más cercano al registro concreto
 * sin inventar pantallas nuevas.
 *
 * Los recordatorios de cobro con varios negocios abren Cartera filtrada por la
 * fecha de vencimiento. Las pestañas conservan su estado, así que la ruta lleva
 * un `n` distinto por aviso: Cartera vuelve a aplicar el filtro aunque ya
 * estuviera abierta con esa misma fecha y otros filtros encima.
 */

import { parseCarteraDueParam } from '@/lib/cartera/carteraDeepLink';

export type PushNotificationData = {
  kind?: unknown;
  id?: unknown;
  numero?: unknown;
  order_number?: unknown;
  due_date?: unknown;
};

export type PushDeepLinkOptions = {
  /** Identificador del aviso tocado; distingue un toque de otro. */
  nonce?: string;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Devuelve la ruta a abrir, o `null` si el aviso no trae datos utilizables.
 * Nunca lanza: un payload corrupto no puede tumbar la app al tocar el aviso.
 */
export function buildPushDeepLink(
  data: PushNotificationData | null | undefined,
  options: PushDeepLinkOptions = {}
): string | null {
  if (!data || typeof data !== "object") return null;

  const kind = text(data.kind);
  const id = text(data.id);

  if (kind === "negocio") {
    return id ? `/negocio/${encodeURIComponent(id)}` : null;
  }

  if (kind === "delivery_order" || kind === "purchase_order") {
    const tab = kind === "delivery_order" ? "delivery" : "purchase";
    const numero = text(data.order_number);
    // Sin número de orden la lista se abre igual: es mejor que no hacer nada.
    const query = numero ? `&q=${encodeURIComponent(numero)}` : "";
    return `/(tabs)/all-orders?tab=${tab}${query}`;
  }

  if (kind === "cartera_vencimientos") {
    const due = parseCarteraDueParam(data.due_date);
    if (!due) return null;
    const nonce = text(options.nonce);
    return `/(tabs)/cartera?due=${due}${nonce ? `&n=${encodeURIComponent(nonce)}` : ""}`;
  }

  return null;
}
