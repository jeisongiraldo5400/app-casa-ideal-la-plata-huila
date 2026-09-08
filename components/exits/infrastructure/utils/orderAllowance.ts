import { compositeKey } from '@/components/exits/infrastructure/utils/compositeKey';
import type { DeliveryOrder, DeliveryOrderItem } from '@/components/exits/infrastructure/store/exitsStore';

export type KeyAllowance = {
  lines: DeliveryOrderItem[];
  totalRequired: number;
  totalDelivered: number;
  /** Máximo que puede haber en el carrito para este producto+bodega. */
  maxCart: number;
};

/** Cantidades de la orden para un producto+bodega, reconciliando BD con inventory_exits. */
export function computeKeyAllowance(
  order: DeliveryOrder,
  cacheSlice: Record<string, number>,
  productId: string,
  warehouseId: string
): KeyAllowance {
  const lines = order.items.filter(
    (item) => item.product_id === productId && item.warehouse_id === warehouseId
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
