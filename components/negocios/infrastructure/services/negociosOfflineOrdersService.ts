import {
  getLocalOfflineOrderLines,
  listLocalOfflineOrders,
  listLocalPendingRemissions,
  pendingLocalQuantitiesByOrigin,
  type LocalOfflineOrder,
  type LocalOfflineOrderLine,
  type LocalPendingRemission,
} from '@/lib/offline/repositories/deliveryOrdersRepository';
import { normalizeText } from '@/lib/search/normalizeText';
import {
  mapRemissionOriginRows,
  type DeliveryOrderItemOption,
  type DeliveryOrderOption,
  type PendingRemissionOption,
  type RemissionOriginGroup,
  type RemissionOriginRow,
} from './negociosDeliveryOrdersService';

/**
 * Órdenes de entrega SIN SEÑAL: salen de la foto que bajó el teléfono de las
 * órdenes que el vendedor marcó «Llevar en el teléfono». La foto trae lo
 * disponible según el servidor en el momento de la descarga; aquí se le resta
 * lo que ya tomaron negocios de este mismo teléfono que aún no se enviaron,
 * para no vender dos veces la misma cama en el campo.
 */

/** Motivo cuando la foto sirve pero lo disponible ya lo tomaron negocios sin enviar. */
export const TOMADO_POR_NEGOCIOS_LOCALES =
  'Lo disponible ya lo tomaron negocios de este teléfono que aún no se envían.';

export function pendingOriginKey(originOrderId: string, productId: string, warehouseId: string): string {
  return `${originOrderId}:${productId}:${warehouseId}`;
}

/** Disponible de una línea de la foto menos lo que usan los negocios locales sin enviar. */
export function availableAfterPendingLocal(
  line: Pick<LocalOfflineOrderLine, 'sourceOrderId' | 'productId' | 'warehouseId' | 'availableQuantity'>,
  pending: Map<string, number>
): number {
  const used = pending.get(pendingOriginKey(line.sourceOrderId, line.productId, line.warehouseId)) || 0;
  return Math.max(0, (Number(line.availableQuantity) || 0) - used);
}

/** Líneas de la foto con el formato de `get_remission_origin_products`. */
export function localLinesToOriginRows(
  lines: LocalOfflineOrderLine[],
  pending: Map<string, number>
): RemissionOriginRow[] {
  return lines
    .filter((line) => line.groupKind === 'own' || line.groupKind === 'child')
    .map((line) => ({
      group_kind: line.groupKind === 'child' ? ('child' as const) : ('own' as const),
      source_delivery_order_id: line.sourceOrderId,
      source_order_number: line.sourceOrderNumber,
      source_customer_id: line.sourceCustomerId,
      source_customer_name: line.sourceCustomerName,
      source_has_negocio: line.sourceHasNegocio,
      product_id: line.productId,
      product_name: line.productName,
      warehouse_id: line.warehouseId,
      warehouse_name: line.warehouseName,
      quantity: line.quantity,
      available_quantity: availableAfterPendingLocal(line, pending),
    }));
}

/** Grupos de una remisión llevada: los mismos que arma el RPC con señal. */
export function buildLocalRemissionGroups(
  remissionId: string,
  lines: LocalOfflineOrderLine[],
  pending: Map<string, number>
): RemissionOriginGroup[] {
  return mapRemissionOriginRows(remissionId, localLinesToOriginRows(lines, pending));
}

function toItem(line: LocalOfflineOrderLine, pending: Map<string, number>): DeliveryOrderItemOption {
  return {
    product_id: line.productId,
    product_name: line.productName || 'Producto',
    warehouse_id: line.warehouseId,
    warehouse_name: line.warehouseName || 'Bodega',
    quantity: Number(line.quantity) || 0,
    available_quantity: availableAfterPendingLocal(line, pending),
  };
}

/**
 * Orden llevada con la misma forma que la del buscador con señal. Para una OE
 * de cliente los productos son los de la orden (`self`); para una remisión, lo
 * que se puede tomar de sus grupos (solo informativo: los grupos se arman
 * aparte). Si la foto dice que ya no sirve, o si ya no queda nada, se marca con
 * el motivo y la pantalla la muestra deshabilitada.
 */
export function buildLocalOrderOption(
  order: LocalOfflineOrder,
  lines: LocalOfflineOrderLine[],
  pending: Map<string, number>
): DeliveryOrderOption {
  const items =
    order.orderType === 'remission'
      ? lines
          .filter((line) => line.groupKind === 'own' || (line.groupKind === 'child' && !line.sourceHasNegocio))
          .map((line) => toItem(line, pending))
          .filter((item) => item.available_quantity > 0)
      : lines
          .filter((line) => line.groupKind === 'self')
          .map((line) => toItem(line, pending))
          .filter((item) => item.available_quantity > 0);

  let unusableReason: string | null = null;
  if (!order.usable) unusableReason = order.unusableReason || 'Ya no se puede usar como origen.';
  else if (items.length === 0) unusableReason = TOMADO_POR_NEGOCIOS_LOCALES;

  return {
    id: order.id,
    order_number: order.orderNumber || order.id,
    created_at: '',
    order_type: order.orderType,
    status: order.status,
    customer_id: order.customerId,
    customer_name: order.customerName,
    customer_id_number: null,
    assigned_user_name: null,
    municipio_id: order.municipioId,
    vereda_id: order.veredaId,
    delivery_address: order.deliveryAddress?.trim() || null,
    items,
    from_local: true,
    unusable_reason: unusableReason,
  };
}

function matchesQuery(order: DeliveryOrderOption, query: string): boolean {
  const term = normalizeText(query.trim());
  if (!term) return true;
  return [order.order_number, order.customer_name]
    .filter(Boolean)
    .some((value) => normalizeText(String(value)).includes(term));
}

export interface LocalOrdersResult {
  orders: DeliveryOrderOption[];
  /** Momento de la foto más reciente de las órdenes llevadas. */
  snapshotAt: number | null;
}

/** Órdenes llevadas en el teléfono, filtradas por número o cliente. */
export async function searchLocalOfflineOrders(query = ''): Promise<LocalOrdersResult> {
  const [orders, pending] = await Promise.all([listLocalOfflineOrders(), pendingLocalQuantitiesByOrigin()]);
  const options: DeliveryOrderOption[] = [];
  let snapshotAt: number | null = null;
  for (const order of orders) {
    if (order.snapshotAt && (!snapshotAt || order.snapshotAt > snapshotAt)) snapshotAt = order.snapshotAt;
    const lines = await getLocalOfflineOrderLines(order.id);
    const option = buildLocalOrderOption(order, lines, pending);
    if (matchesQuery(option, query)) options.push(option);
  }
  // Primero las que sirven; dentro de cada bloque, por número.
  options.sort((a, b) => {
    const usableDiff = Number(Boolean(a.unusable_reason)) - Number(Boolean(b.unusable_reason));
    return usableDiff || a.order_number.localeCompare(b.order_number);
  });
  return { orders: options, snapshotAt };
}

/** Grupos (propios / OE hijas) de una remisión llevada, restando lo pendiente local. */
export async function fetchLocalRemissionOriginGroups(remissionId: string): Promise<RemissionOriginGroup[]> {
  const [lines, pending] = await Promise.all([
    getLocalOfflineOrderLines(remissionId),
    pendingLocalQuantitiesByOrigin(),
  ]);
  return buildLocalRemissionGroups(remissionId, lines, pending);
}

export function toPendingRemissionOption(row: LocalPendingRemission): PendingRemissionOption {
  return {
    id: row.id,
    order_number: row.orderNumber || row.id,
    assigned_to_user_id: row.assignedToUserId,
    assigned_user_name: row.assignedUserName,
    zone_name: null,
    created_at: row.createdAt || '',
    notes: null,
  };
}

/** Remisiones `pending` de la lista ligera que bajó el teléfono. */
export async function fetchLocalPendingRemissions(): Promise<PendingRemissionOption[]> {
  const rows = await listLocalPendingRemissions();
  return rows.map(toPendingRemissionOption);
}
