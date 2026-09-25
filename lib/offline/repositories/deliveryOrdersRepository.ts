import { Q } from '@nozbe/watermelondb';
import { getDatabase, isDatabaseOpen } from '../database';
import { DeliveryOrderLine, DeliveryOrderLocal, PendingRemission, SyncOutboxItem } from '../models';
import { ORDERS_SNAPSHOT_AT_META_KEY } from '../sync/ordersSnapshot';
import { getMeta } from '../sync/outbox';

/**
 * Lecturas de la foto de órdenes llevadas en el teléfono y de las remisiones
 * pendientes (descarga selectiva, esquema local v11).
 *
 * Todo es «lo de la última descarga»: lo disponible puede haber cambiado desde
 * entonces, y el asistente de negocio lo dice con `snapshotAt`.
 */

export type LocalOfflineOrderGroupKind = 'own' | 'child' | 'self';

/*
 * Tipos idénticos a los que ya consume el paquete E (asistente de negocio).
 * Donde el servidor no manda un dato se rellena con un valor legible en vez de
 * null, para que el asistente no tenga que comprobarlo en cada pantalla.
 */

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
  /** Motivo por el que ya no sirve (sólo si `usable` es false). */
  unusableReason: string | null;
  /** Momento (ms) de la foto que se descargó. */
  snapshotAt: number | null;
}

/** Línea de origen de una orden llevada (grupo propio, OE hija o la orden misma). */
export interface LocalOfflineOrderLine {
  orderId: string;
  groupKind: LocalOfflineOrderGroupKind;
  /** Orden de la que sale el producto; la propia orden si el servidor no la da. */
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

/** Comandos de negocio que el servidor todavía no ha recibido. */
const UNSENT_OUTBOX_STATUSES = ['pending', 'syncing', 'error'];

function byOrderNumber<T extends { orderNumber: string }>(a: T, b: T) {
  return (a.orderNumber || '').localeCompare(b.orderNumber || '', 'es', { numeric: true });
}

function groupKind(value: string): LocalOfflineOrderGroupKind {
  return value === 'own' || value === 'child' ? value : 'self';
}

export async function listLocalOfflineOrders(): Promise<LocalOfflineOrder[]> {
  if (!isDatabaseOpen()) return [];
  const rows = await getDatabase().get<DeliveryOrderLocal>('delivery_orders_local').query().fetch();
  return rows
    .map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber || row.id.slice(0, 8),
      orderType: (row.orderType === 'remission' ? 'remission' : 'customer') as LocalOfflineOrder['orderType'],
      status: row.status,
      customerId: row.customerId ?? null,
      customerName: row.customerName ?? null,
      municipioId: row.municipioId ?? null,
      veredaId: row.veredaId ?? null,
      deliveryAddress: row.deliveryAddress ?? null,
      usable: row.usable !== false,
      unusableReason: row.usable === false ? row.unusableReason ?? null : null,
      snapshotAt: row.snapshotAt ?? null,
    }))
    .sort(byOrderNumber);
}

export async function getLocalOfflineOrderLines(orderId: string): Promise<LocalOfflineOrderLine[]> {
  if (!isDatabaseOpen() || !orderId) return [];
  const rows = await getDatabase()
    .get<DeliveryOrderLine>('delivery_order_lines')
    .query(Q.where('order_id', orderId))
    .fetch();
  return [...rows]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((row) => ({
      orderId: row.orderId,
      groupKind: groupKind(row.groupKind),
      sourceOrderId: row.sourceOrderId || row.orderId,
      sourceOrderNumber: row.sourceOrderNumber ?? null,
      sourceCustomerId: row.sourceCustomerId ?? null,
      sourceCustomerName: row.sourceCustomerName ?? null,
      sourceHasNegocio: row.sourceHasNegocio === true,
      productId: row.productId,
      productName: row.productName || 'Producto',
      productSku: row.productSku ?? null,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName || 'Bodega',
      quantity: Number(row.quantity) || 0,
      availableQuantity: Math.max(0, Number(row.availableQuantity) || 0),
    }));
}

export async function listLocalPendingRemissions(): Promise<LocalPendingRemission[]> {
  if (!isDatabaseOpen()) return [];
  const rows = await getDatabase().get<PendingRemission>('pending_remissions').query().fetch();
  return rows
    .map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber || row.id.slice(0, 8),
      status: row.status,
      createdAt: row.remissionCreatedAt ?? null,
      assignedToUserId: row.assignedUserId ?? null,
      assignedUserName: row.assignedUserName ?? null,
      nestedOrdersCount: Number(row.nestedOrdersCount) || 0,
    }))
    .sort(byOrderNumber);
}

/** Momento (ms) de la última foto de órdenes; null si nunca llegó. */
export async function localOrdersSnapshotAt(): Promise<number | null> {
  if (!isDatabaseOpen()) return null;
  const raw = await getMeta(getDatabase(), ORDERS_SNAPSHOT_AT_META_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Clave de `pendingLocalQuantitiesByOrigin`. */
export function originQuantityKey(originOrderId: string, productId: string, warehouseId: string) {
  return `${originOrderId}:${productId}:${warehouseId}`;
}

/**
 * Lo que ya tomaron de cada orden de origen los negocios creados en ESTE
 * teléfono que el servidor todavía no ha recibido. La foto no los conoce, así
 * que el asistente lo resta de lo disponible para no vender dos veces lo mismo.
 *
 * Clave `${originOrderId}:${productId}:${warehouseId}`; el origen es el
 * `source_delivery_order_id` del negocio (la remisión en el grupo propio, la
 * OE hija o la OE suelta), o `remission_id` si sólo viniera ése. Los
 * rechazados no cuentan: no se llevaron nada.
 */
export async function pendingLocalQuantitiesByOrigin(): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!isDatabaseOpen()) return totals;
  const commands = await getDatabase()
    .get<SyncOutboxItem>('sync_outbox')
    .query(Q.where('type', 'create_negocio'), Q.where('status', Q.oneOf(UNSENT_OUTBOX_STATUSES)))
    .fetch();
  for (const command of commands) {
    let payload: { negocio?: Record<string, unknown>; items?: Record<string, unknown>[] };
    try {
      payload = JSON.parse(command.payloadJson) || {};
    } catch {
      continue;
    }
    const negocio = payload.negocio || {};
    const origin = negocio.source_delivery_order_id || negocio.remission_id;
    if (typeof origin !== 'string' || !origin) continue;
    for (const item of Array.isArray(payload.items) ? payload.items : []) {
      const productId = item?.product_id;
      const warehouseId = item?.warehouse_id;
      const quantity = Number(item?.quantity);
      if (typeof productId !== 'string' || typeof warehouseId !== 'string') continue;
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const key = originQuantityKey(origin, productId, warehouseId);
      totals.set(key, (totals.get(key) || 0) + quantity);
    }
  }
  return totals;
}
