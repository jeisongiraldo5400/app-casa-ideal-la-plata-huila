import { matchesDigits, matchesNormalized } from '@/lib/search/normalizeText';
import { fetchLocationCatalogsFromLocal } from '@/lib/offline/repositories/catalogRepository';
import {
  getLocalOfflineOrderLines,
  listLocalOfflineOrders,
  type LocalOfflineOrder,
  type LocalOfflineOrderLine,
} from '@/lib/offline/repositories/deliveryOrdersRepository';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { formatLastDownloadTime } from '@/lib/offline/sync/downloadData';
import { toDeliveryOrderItem } from '../../domain/deliveryOrderItem';
import { matchesDeliveryLocation, type DeliveryLocationFilter } from '../../domain/deliveryLocation';
import type { DeliveryOrder, DeliveryOrderItem } from '../../types';

/**
 * Órdenes de entrega leídas del teléfono cuando no hay señal.
 *
 * Son las que el vendedor marcó «Llevar en el teléfono» y bajaron al pulsar
 * «Descargar» (tablas `delivery_orders_local` y `delivery_order_lines`). Antes
 * las listas y el detalle de órdenes iban siempre al servidor: sin señal se
 * quedaban en error aunque la orden estuviera guardada. Aquí se traducen a las
 * mismas formas que pinta la pantalla con señal.
 *
 * La descarga no trae lo entregado ni lo devuelto (cambia en cuanto alguien
 * despacha): las órdenes van marcadas `from_local` y la pantalla no inventa
 * avances; en su lugar muestra lo que quedaba libre en la última descarga.
 */

/**
 * ¿Hay que leer del teléfono? Sin señal según NetInfo, o cuando la consulta al
 * servidor falló por red o por tiempo de espera (señal débil: NetInfo dice que
 * hay red pero la petición no llega).
 */
export function shouldUseLocalOrders(error?: unknown): boolean {
  if (!useSyncStore.getState().online) return true;
  return error !== undefined && isNetworkError(error);
}

/**
 * Aviso discreto de que lo visible salió del teléfono. `source` dice de qué es
 * la hora: la descarga de órdenes o la última lista que llegó con señal.
 */
export function localOrdersNotice(snapshotAt: number | null, source = 'descarga'): string {
  const when = formatLastDownloadTime(snapshotAt);
  return when
    ? `Sin señal: mostrando lo guardado en el teléfono (${source} ${when}).`
    : 'Sin señal: mostrando lo guardado en el teléfono.';
}

/** Orden guardada sin productos: la descarga sólo los trae si aún sirve de origen. */
export function localOrderWithoutLinesMessage(reason: string): string {
  return `${reason.replace(/\.$/, '')}: sus productos no se guardan en el teléfono. Con señal se ven completos.`;
}

/** Cuando la orden no se llevó al teléfono no hay nada que mostrar sin señal. */
export const ORDER_NOT_ON_PHONE_MESSAGE =
  'Sin señal: esta orden no está guardada en el teléfono. Con señal, pulsa «Llevar en el teléfono» y luego «Descargar» en Preparar el teléfono.';

export class OrderNotOnPhoneError extends Error {
  constructor() {
    super(ORDER_NOT_ON_PHONE_MESSAGE);
    this.name = 'OrderNotOnPhoneError';
  }
}

export function localLineToItem(line: LocalOfflineOrderLine, index: number): DeliveryOrderItem {
  const item = toDeliveryOrderItem({
    id: `${line.orderId}:${index}`,
    product_id: line.productId,
    product_name: line.productName,
    product_sku: line.productSku,
    product_barcode: null,
    warehouse_id: line.warehouseId,
    warehouse_name: line.warehouseName,
    quantity: line.quantity,
    delivered_quantity: 0,
    returned_quantity: 0,
    // Las líneas de una OE hija van con su número y cliente, como con señal.
    source_delivery_order_id: line.groupKind === 'child' ? line.sourceOrderId : null,
    source_order_number: line.sourceOrderNumber,
    source_customer_name: line.sourceCustomerName,
  });
  return { ...item, available_quantity: line.availableQuantity };
}

type LocationNames = {
  municipios: Map<string, { nombre: string; departamento_id: string }>;
  veredas: Map<string, string>;
  departamentos: Map<string, string>;
};

async function loadLocationNames(): Promise<LocationNames> {
  const catalogs = await fetchLocationCatalogsFromLocal().catch(() => null);
  return {
    municipios: new Map(
      (catalogs?.municipios ?? []).map((row) => [row.id, { nombre: row.nombre, departamento_id: row.departamento_id }])
    ),
    veredas: new Map((catalogs?.veredas ?? []).map((row) => [row.id, row.nombre])),
    departamentos: new Map((catalogs?.departamentos ?? []).map((row) => [row.id, row.nombre])),
  };
}

export function localOrderToDeliveryOrder(
  order: LocalOfflineOrder,
  lines: LocalOfflineOrderLine[],
  names?: LocationNames
): DeliveryOrder {
  const items = lines.map(localLineToItem);
  const municipio = order.municipioId ? names?.municipios.get(order.municipioId) : undefined;
  const departamentoId = municipio?.departamento_id || null;
  const isRemission = order.orderType === 'remission';
  return {
    id: order.id,
    order_number: order.orderNumber,
    created_at: order.createdAt || '',
    created_by: '',
    created_by_name: '',
    customer_id: isRemission ? null : order.customerId,
    customer_id_number: isRemission ? null : order.customerIdNumber,
    customer_name: isRemission ? null : order.customerName,
    customer_phone: null,
    customer_email: null,
    assigned_to_user_id: null,
    assigned_to_user_name: order.assignedUserName,
    assigned_to_user_email: null,
    order_type: order.orderType,
    delivery_address: order.deliveryAddress,
    municipio_id: order.municipioId,
    vereda_id: order.veredaId,
    departamento_id: departamentoId,
    departamento_name: departamentoId ? names?.departamentos.get(departamentoId) ?? null : null,
    municipio_name: municipio?.nombre ?? null,
    vereda_name: order.veredaId ? names?.veredas.get(order.veredaId) ?? null : null,
    notes: order.notes,
    status: order.status,
    total_items: items.length,
    total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    delivered_items: 0,
    delivered_quantity: 0,
    items,
    from_local: true,
    snapshot_at: order.snapshotAt,
  };
}

export function matchesLocalOrderSearch(order: DeliveryOrder, search: string): boolean {
  const term = search.trim();
  if (!term) return true;
  return (
    matchesNormalized(
      term,
      order.order_number,
      order.customer_name,
      order.customer_id_number,
      order.delivery_address,
      order.assigned_to_user_name,
      order.municipio_name,
      order.vereda_name
    ) || matchesDigits(term, order.customer_id_number)
  );
}

export type LocalDeliveryOrdersResult = {
  orders: DeliveryOrder[];
  /** Momento (ms) de la descarga más reciente entre las órdenes leídas. */
  snapshotAt: number | null;
};

/** Órdenes llevadas en el teléfono, con el mismo buscador y filtro que con señal. */
export async function listLocalDeliveryOrders(params: {
  search?: string;
  location?: DeliveryLocationFilter;
} = {}): Promise<LocalDeliveryOrdersResult> {
  const [rows, names] = await Promise.all([listLocalOfflineOrders(), loadLocationNames()]);
  const orders: DeliveryOrder[] = [];
  for (const row of rows) {
    const lines = await getLocalOfflineOrderLines(row.id);
    const order = localOrderToDeliveryOrder(row, lines, names);
    if (!matchesLocalOrderSearch(order, params.search ?? '')) continue;
    if (params.location && !matchesDeliveryLocation(order, params.location)) continue;
    orders.push(order);
  }
  // Las más nuevas primero, como el listado del servidor.
  orders.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const snapshotAt = rows.reduce<number | null>(
    (latest, row) => (row.snapshotAt != null && (latest == null || row.snapshotAt > latest) ? row.snapshotAt : latest),
    null
  );
  return { orders, snapshotAt };
}

export type LocalDeliveryOrderItems = {
  items: DeliveryOrderItem[];
  snapshotAt: number | null;
  /**
   * La orden bajó pero ya no sirve de origen de un negocio (p. ej. ya está
   * vinculada a uno): el servidor no manda sus productos en la descarga.
   */
  unusableReason: string | null;
};

/** Productos de una orden llevada; `null` si la orden no está en el teléfono. */
export async function fetchLocalDeliveryOrderItems(orderId: string): Promise<LocalDeliveryOrderItems | null> {
  const rows = await listLocalOfflineOrders();
  const order = rows.find((row) => row.id === orderId);
  if (!order) return null;
  const lines = await getLocalOfflineOrderLines(orderId);
  return {
    items: lines.map(localLineToItem),
    snapshotAt: order.snapshotAt,
    unusableReason: order.usable ? null : order.unusableReason || 'Ya no sirve para un negocio',
  };
}
