/**
 * STUB del paquete E (descarga selectiva). El dueño de este archivo es el
 * paquete BC, que lo implementa sobre las tablas locales `delivery_orders_local`,
 * `delivery_order_lines` y `pending_remissions` (esquema v11). Aquí solo están
 * las firmas y los tipos EXACTOS del contrato para que el asistente de negocio
 * compile y se pueda probar; el integrador se queda con la versión de BC.
 *
 * Mientras tanto todo devuelve vacío: sin foto de órdenes el asistente dice
 * que no hay órdenes en el teléfono, que es la verdad.
 */

export type LocalOfflineOrderGroupKind = 'own' | 'child' | 'self';

/** Cabecera de una orden llevada en el teléfono (`delivery_orders_snapshot`). */
export interface LocalOfflineOrder {
  id: string;
  orderNumber: string;
  orderType: 'remission' | 'customer';
  status: string;
  customerId: string | null;
  customerName: string | null;
  municipioId: string | null;
  veredaId: string | null;
  deliveryAddress: string | null;
  /** El servidor dice si todavía sirve de origen de un negocio. */
  usable: boolean;
  unusableReason: string | null;
  /** Momento (ms) de la foto que se descargó. */
  snapshotAt: number | null;
}

/** Línea de origen de una orden llevada (grupo propio, OE hija o la orden misma). */
export interface LocalOfflineOrderLine {
  orderId: string;
  groupKind: LocalOfflineOrderGroupKind;
  sourceOrderId: string;
  sourceOrderNumber: string | null;
  sourceCustomerId: string | null;
  sourceCustomerName: string | null;
  sourceHasNegocio: boolean;
  productId: string;
  productName: string;
  productSku: string | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  availableQuantity: number;
}

/** Remisión `pending` de la lista ligera (Enviar en remisión). */
export interface LocalPendingRemission {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string | null;
  assignedToUserId: string | null;
  assignedUserName: string | null;
  nestedOrdersCount: number;
}

export async function listLocalOfflineOrders(): Promise<LocalOfflineOrder[]> {
  return [];
}

export async function getLocalOfflineOrderLines(_orderId: string): Promise<LocalOfflineOrderLine[]> {
  return [];
}

export async function listLocalPendingRemissions(): Promise<LocalPendingRemission[]> {
  return [];
}

export async function localOrdersSnapshotAt(): Promise<number | null> {
  return null;
}

/**
 * Lo que ya usan los negocios de este teléfono aún no enviados, por
 * `${originOrderId}:${productId}:${warehouseId}`.
 */
export async function pendingLocalQuantitiesByOrigin(): Promise<Map<string, number>> {
  return new Map();
}
