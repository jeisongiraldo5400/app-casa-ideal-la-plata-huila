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
 * Los traslados (transfer_dispatched / transfer_received / transfer_differences
 * / transfer_overdue; `data.kind = 'transfer_order'`, migración 20261231290000)
 * abren su detalle: la pantalla elige sola si toca recibir, despachar o solo ver.
 *
 * Los avisos de venta por debajo del costo (`cost_sale_alert`, `data.kind =
 * 'cost_alert'`, migración 20261231620000; solo llegan al perfil Costos) abren
 * su pantalla propia (`app/costos/aviso/[negocioId].tsx`) con el costo y la
 * ganancia por línea: el detalle del negocio nunca muestra costos.
 *
 * Los avisos de mercancía sin costo (`cost_po_received_uncosted`, `data.kind =
 * 'cost_po_uncosted'`, migración 20261231810000; solo perfil Costos) abren una
 * pantalla simple que indica costear la orden desde la web: en el teléfono no
 * hay pantalla para costear.
 *
 * Los recordatorios de cobro con varios negocios abren Cartera filtrada por la
 * fecha de vencimiento. Las pestañas conservan su estado, así que la ruta lleva
 * un `n` distinto por aviso: Cartera vuelve a aplicar el filtro aunque ya
 * estuviera abierta con esa misma fecha y otros filtros encima.
 */

import { parseCarteraDueParam } from '@/lib/cartera/carteraDeepLink';
import { costAlertRoute } from '@/lib/costos/access';
import { buildUncostedOrderRoute } from '@/lib/costos/uncostedOrderNotice';

export type PushNotificationData = {
  kind?: unknown;
  id?: unknown;
  numero?: unknown;
  order_number?: unknown;
  due_date?: unknown;
  negocio_id?: unknown;
  uncosted_count?: unknown;
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

  if (kind === "cost_alert") {
    const negocioId = text(data.negocio_id) || id;
    return negocioId ? costAlertRoute(negocioId) : null;
  }

  if (kind === "cost_po_uncosted") {
    return buildUncostedOrderRoute(data);
  }

  if (kind === "delivery_order" || kind === "purchase_order") {
    const tab = kind === "delivery_order" ? "delivery" : "purchase";
    const numero = text(data.order_number);
    // Sin número de orden la lista se abre igual: es mejor que no hacer nada.
    const query = numero ? `&q=${encodeURIComponent(numero)}` : "";
    // Como en Cartera: `n` hace que la lista reaplique pestaña y búsqueda
    // aunque ya estuviera abierta (ver useAllOrdersRouteState).
    const nonce = text(options.nonce);
    return `/(tabs)/all-orders?tab=${tab}${query}${nonce ? `&n=${encodeURIComponent(nonce)}` : ""}`;
  }

  // Un cliente abrió el catálogo que el vendedor le compartió: se abre esa
  // edición, donde se ven sus enlaces y cuántas veces se abrió cada uno.
  if (kind === "catalogo") {
    return id ? `/catalogo/${encodeURIComponent(id)}` : null;
  }

  if (kind === "transfer_order") {
    return id ? `/traslado/${encodeURIComponent(id)}` : null;
  }

  if (kind === "cartera_vencimientos") {
    const due = parseCarteraDueParam(data.due_date);
    if (!due) return null;
    const nonce = text(options.nonce);
    return `/(tabs)/cartera?due=${due}${nonce ? `&n=${encodeURIComponent(nonce)}` : ""}`;
  }

  return null;
}
