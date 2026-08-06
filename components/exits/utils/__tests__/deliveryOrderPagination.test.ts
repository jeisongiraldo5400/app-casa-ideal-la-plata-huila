import { getVisibleDeliveryOrders, ORDER_PAGE_SIZE } from '../deliveryOrderPagination';

describe('delivery order pagination', () => {
  const orders = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));

  it('shows five orders on the initial page', () => {
    expect(getVisibleDeliveryOrders(orders, ORDER_PAGE_SIZE)).toHaveLength(5);
  });

  it('adds orders in blocks without exceeding the available collection', () => {
    expect(getVisibleDeliveryOrders(orders, ORDER_PAGE_SIZE * 2)).toHaveLength(10);
    expect(getVisibleDeliveryOrders(orders, ORDER_PAGE_SIZE * 3)).toHaveLength(12);
  });

  it('does not mutate the source collection', () => {
    const visible = getVisibleDeliveryOrders(orders, ORDER_PAGE_SIZE);
    expect(orders).toHaveLength(12);
    expect(visible).not.toBe(orders);
  });
});
