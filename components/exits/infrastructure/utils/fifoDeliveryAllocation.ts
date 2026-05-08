import { compositeKey } from '@/components/exits/infrastructure/utils/compositeKey';

export type FifoAllocatableLine = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  db_delivered_quantity: number;
  created_at: string;
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
 * Total delivered for a (product, warehouse) group on this order:
 * reconciles sum of DB row delivered_quantity with inventory_exits aggregate, capped by total ordered qty.
 */
export function aggregateRegisteredTotalForGroup(
  lines: FifoAllocatableLine[],
  exitTotalRaw: number
): number {
  const sumDb = lines.reduce((s, l) => s + (l.db_delivered_quantity || 0), 0);
  const sumQty = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  if (sumQty <= 0) return 0;
  return Math.min(Math.max(sumDb, exitTotalRaw), sumQty);
}

/**
 * Per-line FIFO allocation of registered total and session scans (oldest line first).
 * `registeredTotalByKey` must already reconcile DB vs inventory_exits (e.g. from registeredExitsCache).
 */
export function computeFifoProgressByItemId<T extends FifoAllocatableLine>(
  items: T[],
  registeredTotalByKey: Record<string, number>,
  sessionByKey: Map<string, number>
): Map<string, FifoLineProgress> {
  const out = new Map<string, FifoLineProgress>();

  const byKey = new Map<string, T[]>();
  for (const item of items) {
    const k = compositeKey(item.product_id, item.warehouse_id);
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
