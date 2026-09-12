import { OWN_GROUP_KEY } from '@/components/exits/infrastructure/utils/compositeKey';

/** Datos mínimos de una línea para saber a qué grupo (propios u OE hija) pertenece. */
export type DeliveryGroupSource = {
  source_delivery_order_id: string | null;
  source_order_number?: string | null;
  source_customer_name?: string | null;
};

export const OWN_REMISSION_GROUP_LABEL = 'Productos de la remisión';
export const OWN_ORDER_GROUP_LABEL = 'Productos de la orden';

/** `source_delivery_order_id` de la línea o `'own'` para las líneas propias. */
export function groupKeyOf(sourceDeliveryOrderId: string | null | undefined): string {
  return sourceDeliveryOrderId || OWN_GROUP_KEY;
}

/** Orden real contra la que se registran las salidas de un grupo. */
export function targetOrderIdForGroup(orderId: string, groupKey: string): string {
  return groupKey === OWN_GROUP_KEY ? orderId : groupKey;
}

export function ownGroupLabel(orderType: string | null | undefined): string {
  return orderType === 'remission' ? OWN_REMISSION_GROUP_LABEL : OWN_ORDER_GROUP_LABEL;
}

export function childGroupLabel(item: DeliveryGroupSource): string {
  const number = item.source_order_number || (item.source_delivery_order_id || '').slice(0, 8) || 'OE';
  return `${number} · ${item.source_customer_name || 'Cliente'}`;
}

export function groupLabelFor(
  order: { order_type?: string | null; items: DeliveryGroupSource[] },
  groupKey: string
): string {
  if (groupKey === OWN_GROUP_KEY) return ownGroupLabel(order.order_type);
  const sample = order.items.find((item) => item.source_delivery_order_id === groupKey);
  return sample ? childGroupLabel(sample) : `${groupKey.slice(0, 8)} · Cliente`;
}

/**
 * Claves de grupo presentes en las líneas: propios primero (si los hay) y luego las
 * OE hijas por número de orden.
 */
export function orderedGroupKeys(items: DeliveryGroupSource[]): string[] {
  const children = new Map<string, DeliveryGroupSource>();
  let hasOwn = false;
  items.forEach((item) => {
    if (!item.source_delivery_order_id) {
      hasOwn = true;
      return;
    }
    if (!children.has(item.source_delivery_order_id)) children.set(item.source_delivery_order_id, item);
  });
  const sortedChildren = [...children.entries()]
    .sort(([idA, a], [idB, b]) => {
      const byNumber = (a.source_order_number || '').localeCompare(b.source_order_number || '', 'es', { numeric: true });
      return byNumber !== 0 ? byNumber : idA.localeCompare(idB);
    })
    .map(([id]) => id);
  return hasOwn ? [OWN_GROUP_KEY, ...sortedChildren] : sortedChildren;
}
