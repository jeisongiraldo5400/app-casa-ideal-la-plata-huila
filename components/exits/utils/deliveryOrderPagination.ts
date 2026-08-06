export const ORDER_PAGE_SIZE = 5;

/** Keeps the selector compact without mutating the source collection. */
export function getVisibleDeliveryOrders<T>(orders: readonly T[], visibleCount: number): T[] {
  const safeCount = Number.isFinite(visibleCount) ? Math.max(0, Math.floor(visibleCount)) : ORDER_PAGE_SIZE;
  return orders.slice(0, safeCount);
}
