import { OWN_GROUP_KEY, compositeKey, groupedKey } from '@/components/exits/infrastructure/utils/compositeKey';
import { targetOrderIdForGroup } from '@/components/exits/infrastructure/utils/deliveryGroups';
import type { DeliveryOrder, DeliveryOrderItem } from '@/components/exits/infrastructure/store/exitsStore';

export type KeyAllowance = {
  lines: DeliveryOrderItem[];
  totalRequired: number;
  totalDelivered: number;
  /** Máximo que puede haber en el carrito para este producto+bodega+grupo. */
  maxCart: number;
};

/**
 * Cantidades de la orden para un producto+bodega dentro de un grupo, reconciliando BD con
 * inventory_exits. `cacheSlice` es el slot de la orden objetivo del grupo
 * (`registeredExitsCache[targetOrderIdForGroup(order.id, groupKey)]`).
 */
export function computeKeyAllowance(
  order: DeliveryOrder,
  cacheSlice: Record<string, number>,
  productId: string,
  warehouseId: string,
  groupKey: string = OWN_GROUP_KEY
): KeyAllowance {
  const lines = order.items.filter(
    (item) =>
      item.product_id === productId &&
      item.warehouse_id === warehouseId &&
      (item.group_key ?? OWN_GROUP_KEY) === groupKey
  );
  const totalRequired = lines.reduce((sum, item) => sum + item.quantity, 0);
  const sumDbDelivered = lines.reduce((sum, item) => sum + item.db_delivered_quantity, 0);
  const cacheTotal = cacheSlice[compositeKey(productId, warehouseId)] ?? 0;
  const totalDelivered = Math.min(Math.max(sumDbDelivered, cacheTotal), totalRequired);
  return {
    lines,
    totalRequired,
    totalDelivered,
    maxCart: Math.max(totalRequired - totalDelivered, 0),
  };
}

/**
 * Puente entre la caché (por orden objetivo y producto+bodega) y el FIFO (por grupo):
 * groupedKey -> total registrado leído del slot de la orden objetivo de cada grupo.
 */
export function buildGroupedRegisteredTotals(
  order: { id: string; items: { product_id: string; warehouse_id: string; group_key?: string }[] },
  cacheByOrder: Record<string, Record<string, number>>
): Record<string, number> {
  const totals: Record<string, number> = {};
  order.items.forEach((item) => {
    const group = item.group_key ?? OWN_GROUP_KEY;
    const key = groupedKey(item.product_id, item.warehouse_id, group);
    if (key in totals) return;
    const slice = cacheByOrder[targetOrderIdForGroup(order.id, group)] || {};
    const registered = slice[compositeKey(item.product_id, item.warehouse_id)] ?? 0;
    if (registered > 0) totals[key] = registered;
  });
  return totals;
}
