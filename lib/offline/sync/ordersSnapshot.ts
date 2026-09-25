import type { Database, Model } from '@nozbe/watermelondb';
import { DeliveryOrderLine, DeliveryOrderLocal, PendingRemission } from '../models';
import { setMeta } from './outbox';
import type {
  PullOfflineOrder,
  PullOfflineOrderLine,
  PullPayload,
  PullPendingRemission,
} from './types';

/**
 * Foto de las órdenes llevadas en el teléfono y de las remisiones pendientes.
 *
 * El servidor las recalcula COMPLETAS en cada pull (20261130140000): lo
 * disponible cambia en cuanto otro vendedor vende, así que no hay delta que
 * valga. Cada paquete que las trae reemplaza todo lo local; uno que no las
 * trae (servidor anterior o descarga sin `p_options`) deja lo que había, con
 * su hora, para que el asistente diga de cuándo es.
 */
export const ORDERS_SNAPSHOT_AT_META_KEY = 'delivery_orders_snapshot_at';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text ? text : null;
}

function snapshotTime(payload: PullPayload): number | null {
  const parsed = Date.parse(payload.snapshot_at || payload.server_time || '');
  return Number.isNaN(parsed) ? null : parsed;
}

function remissionCount(row: PullPendingRemission): number {
  return num(row.nested_orders_count ?? row.child_orders_count ?? row.orders_count ?? 0);
}

function lineSourceOrderId(line: PullOfflineOrderLine): string | null {
  return str(line.source_order_id ?? line.source_delivery_order_id);
}

type ReplacementRow<T> = { id: string; fill: (record: T) => void };

/**
 * Deja la tabla exactamente con `rows`: actualiza las que ya estaban,
 * crea las nuevas y borra las que no vinieron. No se destruye y recrea el
 * mismo id en un lote (la caché de registros de WatermelonDB no lo admite).
 */
async function prepareReplacement<T extends Model>(
  database: Database,
  table: string,
  rows: ReplacementRow<T>[]
): Promise<Model[]> {
  const collection = database.get<T>(table);
  const existing = await collection.query().fetch();
  const byId = new Map(existing.map((record) => [record.id, record]));
  const wanted = new Set(rows.map((row) => row.id));
  const operations: Model[] = [];
  for (const record of existing) {
    if (!wanted.has(record.id)) operations.push(record.prepareDestroyPermanently());
  }
  for (const row of rows) {
    const current = byId.get(row.id);
    if (current) {
      operations.push(current.prepareUpdate(row.fill));
    } else {
      operations.push(
        collection.prepareCreate((record) => {
          record._raw.id = row.id;
          row.fill(record);
        })
      );
    }
  }
  return operations;
}

/**
 * Reemplaza la foto local. Devuelve qué partes se reemplazaron.
 *
 * Al recaudador puro (alcance 'cobro') el servidor no le manda órdenes ni
 * remisiones: si antes tuvo otro rol, lo que quedó en el teléfono se borra.
 */
export async function applyOrdersSnapshot(
  database: Database,
  payload: PullPayload
): Promise<{ orders: boolean; remissions: boolean }> {
  const cobro = payload.pull_scope === 'cobro';
  const orders: PullOfflineOrder[] | null = Array.isArray(payload.delivery_orders_snapshot)
    ? payload.delivery_orders_snapshot
    : cobro
      ? []
      : null;
  const remissions: PullPendingRemission[] | null = Array.isArray(payload.pending_remissions)
    ? payload.pending_remissions
    : cobro
      ? []
      : null;
  if (!orders && !remissions) return { orders: false, remissions: false };

  const operations: Model[] = [];
  const at = snapshotTime(payload);

  if (orders) {
    const orderRows: ReplacementRow<DeliveryOrderLocal>[] = [];
    const lineRows: ReplacementRow<DeliveryOrderLine>[] = [];
    const seen = new Set<string>();
    for (const order of orders) {
      if (!order?.id || seen.has(order.id)) continue;
      seen.add(order.id);
      orderRows.push({
        id: order.id,
        fill: (record) => {
          record.orderNumber = str(order.order_number);
          record.orderType = String(order.order_type || 'customer');
          record.status = String(order.status || '');
          record.customerId = str(order.customer_id);
          record.customerName = str(order.customer_name);
          record.municipioId = str(order.municipio_id);
          record.veredaId = str(order.vereda_id);
          record.deliveryAddress = str(order.delivery_address);
          record.usable = order.usable !== false;
          record.unusableReason = order.usable === false ? str(order.unusable_reason) : null;
          record.snapshotAt = at;
        },
      });
      (order.lines || []).forEach((line, index) => {
        if (!line?.product_id || !line.warehouse_id) return;
        lineRows.push({
          id: `${order.id}:${index}`,
          fill: (record) => {
            record.orderId = order.id;
            record.position = index;
            record.groupKind =
              line.group_kind === 'own' || line.group_kind === 'child' ? line.group_kind : 'self';
            record.sourceOrderId = lineSourceOrderId(line);
            record.sourceOrderNumber = str(line.source_order_number);
            record.sourceCustomerId = str(line.source_customer_id);
            record.sourceCustomerName = str(line.source_customer_name);
            record.sourceHasNegocio = line.source_has_negocio === true;
            record.productId = line.product_id;
            record.productName = str(line.product_name);
            record.productSku = str(line.product_sku);
            record.warehouseId = line.warehouse_id;
            record.warehouseName = str(line.warehouse_name);
            record.quantity = num(line.quantity);
            record.availableQuantity = Math.max(0, num(line.available_quantity));
          },
        });
      });
    }
    operations.push(...(await prepareReplacement(database, 'delivery_orders_local', orderRows)));
    operations.push(...(await prepareReplacement(database, 'delivery_order_lines', lineRows)));
  }

  if (remissions) {
    const rows: ReplacementRow<PendingRemission>[] = [];
    const seen = new Set<string>();
    for (const row of remissions) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push({
        id: row.id,
        fill: (record) => {
          record.orderNumber = str(row.order_number);
          record.status = String(row.status || 'pending');
          record.remissionCreatedAt = str(row.created_at);
          record.assignedUserId = str(row.assigned_user_id ?? row.assigned_to_user_id);
          record.assignedUserName = str(row.assigned_user_name ?? row.assigned_to_name);
          record.driverName = str(row.driver_name);
          record.zoneName = str(row.zone_name);
          record.nestedOrdersCount = remissionCount(row);
        },
      });
    }
    operations.push(...(await prepareReplacement(database, 'pending_remissions', rows)));
  }

  await database.write(async () => {
    await database.batch(...operations);
  });
  if (orders && at != null) await setMeta(database, ORDERS_SNAPSHOT_AT_META_KEY, String(at));
  return { orders: Boolean(orders), remissions: Boolean(remissions) };
}
