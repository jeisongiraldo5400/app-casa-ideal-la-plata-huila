import { usePurchaseOrdersStore } from '../store/purchaseOrdersStore';

/**
 * Hook personalizado para acceder al store de órdenes de compra
 */
export function usePurchaseOrders() {
  return usePurchaseOrdersStore();
}

