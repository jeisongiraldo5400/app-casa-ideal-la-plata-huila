import { computeKeyAllowance } from '../orderAllowance';
import { compositeKey } from '../compositeKey';
import type { DeliveryOrder, DeliveryOrderItem } from '../../store/exitsStore';

function line(overrides: Partial<DeliveryOrderItem>): DeliveryOrderItem {
  return {
    id: 'item-1',
    product_id: 'product-1',
    product_name: 'Nevera',
    product_barcode: '770123',
    product_sku: 'NEV-1',
    warehouse_id: 'warehouse-1',
    warehouse_name: 'Bodega 1',
    quantity: 1,
    delivered_quantity: 0,
    pending_quantity: 1,
    db_delivered_quantity: 0,
    created_at: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

function order(items: DeliveryOrderItem[]): DeliveryOrder {
  return {
    id: 'order-1',
    order_number: 'OE-1',
    customer_id: 'customer-1',
    customer_name: 'Cliente',
    customer_id_number: '1',
    status: 'pending',
    delivery_address: null,
    notes: null,
    created_at: '2026-09-10T10:00:00.000Z',
    items,
  };
}

describe('computeKeyAllowance', () => {
  it('solo cuenta las líneas del mismo producto EN LA MISMA BODEGA', () => {
    const deliveryOrder = order([
      line({ id: 'a', warehouse_id: 'warehouse-1', quantity: 3, db_delivered_quantity: 1 }),
      line({ id: 'b', warehouse_id: 'warehouse-2', quantity: 10, db_delivered_quantity: 0 }),
      line({ id: 'c', product_id: 'product-2', warehouse_id: 'warehouse-1', quantity: 7 }),
    ]);

    const allowance = computeKeyAllowance(deliveryOrder, {}, 'product-1', 'warehouse-1');

    expect(allowance.lines.map((item) => item.id)).toEqual(['a']);
    expect(allowance.totalRequired).toBe(3);
    expect(allowance.totalDelivered).toBe(1);
    expect(allowance.maxCart).toBe(2);
  });

  it('suma varias líneas del mismo producto y bodega', () => {
    const deliveryOrder = order([
      line({ id: 'a', quantity: 2, db_delivered_quantity: 1 }),
      line({ id: 'b', quantity: 3, db_delivered_quantity: 1 }),
    ]);

    const allowance = computeKeyAllowance(deliveryOrder, {}, 'product-1', 'warehouse-1');

    expect(allowance.totalRequired).toBe(5);
    expect(allowance.totalDelivered).toBe(2);
    expect(allowance.maxCart).toBe(3);
  });

  it('usa lo registrado en inventory_exits cuando la BD aún no refleja la entrega', () => {
    const deliveryOrder = order([line({ quantity: 4, db_delivered_quantity: 1 })]);
    const cache = { [compositeKey('product-1', 'warehouse-1')]: 3 };

    const allowance = computeKeyAllowance(deliveryOrder, cache, 'product-1', 'warehouse-1');

    expect(allowance.totalDelivered).toBe(3);
    expect(allowance.maxCart).toBe(1);
  });

  it('el caché de otra bodega no descuenta cupo', () => {
    const deliveryOrder = order([line({ quantity: 4, db_delivered_quantity: 0 })]);
    const cache = { [compositeKey('product-1', 'warehouse-2')]: 4 };

    expect(computeKeyAllowance(deliveryOrder, cache, 'product-1', 'warehouse-1').maxCart).toBe(4);
  });

  it('nunca da cupo negativo aunque se haya entregado de más', () => {
    const deliveryOrder = order([line({ quantity: 2, db_delivered_quantity: 5 })]);
    const cache = { [compositeKey('product-1', 'warehouse-1')]: 9 };

    const allowance = computeKeyAllowance(deliveryOrder, cache, 'product-1', 'warehouse-1');

    expect(allowance.totalDelivered).toBe(2);
    expect(allowance.maxCart).toBe(0);
  });

  it('un producto que no está en la orden no tiene cupo', () => {
    const allowance = computeKeyAllowance(order([line({})]), {}, 'product-9', 'warehouse-1');

    expect(allowance).toEqual({ lines: [], totalRequired: 0, totalDelivered: 0, maxCart: 0 });
  });
});
