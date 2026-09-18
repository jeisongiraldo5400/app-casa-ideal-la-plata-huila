import { compositeKey, groupedKey } from '@/components/exits/infrastructure/utils/compositeKey';
import { resolvedDeliveryQuantity } from '@/components/purchase-orders/domain/deliveryOrderItem';

export type FifoAllocatableLine = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  db_delivered_quantity: number;
  /** Devuelto por el cliente (delivery_order_items.returned_quantity). 0 si falta. */
  db_returned_quantity?: number;
  created_at: string;
  /** Grupo de la línea (`'own'` u OE hija). Ausente equivale a `'own'`. */
  group_key?: string;
};

export type FifoLineProgress = {
  registered: number;
  sessionScanned: number;
  pending: number;
};

export function sortLinesFifo<T extends FifoAllocatableLine>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Unidades ya resueltas de un (producto, bodega) en esta orden: lo entregado más
 * lo devuelto por el cliente, con tope en lo pedido.
 *
 * Se toma además como piso lo que ya salió de bodega (`inventory_exits` no
 * canceladas): una salida no se borra al devolver, así que aunque la base
 * todavía no tenga `returned_quantity` una unidad devuelta nunca se vuelve a
 * ofrecer para despachar. Con la migración aplicada ambos números coinciden.
 */
export function aggregateRegisteredTotalForGroup(
  lines: FifoAllocatableLine[],
  exitTotalRaw: number
): number {
  const sumResolved = lines.reduce(
    (s, l) => s + resolvedDeliveryQuantity(l.quantity || 0, l.db_delivered_quantity || 0, l.db_returned_quantity || 0),
    0
  );
  const sumQty = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  if (sumQty <= 0) return 0;
  return Math.min(Math.max(sumResolved, exitTotalRaw), sumQty);
}

/**
 * Per-line FIFO allocation of registered total and session scans (oldest line first).
 * Lines are grouped by `groupedKey(product, warehouse, group_key)`: both maps must be
 * indexed by that key (see `buildGroupedRegisteredTotals` for the registered side).
 */
export function computeFifoProgressByItemId<T extends FifoAllocatableLine>(
  items: T[],
  registeredTotalByKey: Record<string, number>,
  sessionByKey: Map<string, number>
): Map<string, FifoLineProgress> {
  const out = new Map<string, FifoLineProgress>();

  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const k = groupedKey(item.product_id, item.warehouse_id, item.group_key);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(item);
  }

  byKey.forEach((groupLines, key) => {
    const sorted = sortLinesFifo(groupLines);
    const sumQty = sorted.reduce((s, l) => s + (l.quantity || 0), 0);
    const totalReg = Math.min(
      Math.max(registeredTotalByKey[key] ?? 0, 0),
      sumQty
    );
    const sessionTotal = sessionByKey.get(key) || 0;

    let remReg = totalReg;
    const regAlloc = sorted.map((l) => {
      const v = Math.min(Math.max(l.quantity, 0), Math.max(remReg, 0));
      remReg -= v;
      return v;
    });

    let remSess = sessionTotal;
    const sessAlloc = sorted.map((l, i) => {
      const room = Math.max(l.quantity - regAlloc[i], 0);
      const v = Math.min(room, remSess);
      remSess -= v;
      return v;
    });

    sorted.forEach((l, i) => {
      const reg = regAlloc[i];
      const sess = sessAlloc[i];
      out.set(l.id, {
        registered: reg,
        sessionScanned: sess,
        pending: Math.max(l.quantity - reg - sess, 0)
      });
    });
  });

  return out;
}

/**
 * Build registeredExitsCache entry values: composite key -> aggregate delivered total for that key.
 * The cache slot belongs to ONE target order, so pass only the lines of that group
 * (own lines of the remission, or the copies of one child order): the key ignores `group_key`.
 */
export function buildRegisteredTotalsByKey<T extends FifoAllocatableLine>(
  items: T[],
  exitTotalsByKey: Record<string, number>
): Record<string, number> {
  const cache: Record<string, number> = {};
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const k = compositeKey(item.product_id, item.warehouse_id);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(item);
  }
  byKey.forEach((groupLines, key) => {
    const exitTotal = exitTotalsByKey[key] || 0;
    const total = aggregateRegisteredTotalForGroup(groupLines, exitTotal);
    if (total > 0) cache[key] = total;
  });
  return cache;
}
