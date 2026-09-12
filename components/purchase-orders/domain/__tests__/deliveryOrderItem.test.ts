import { toDeliveryOrderItem } from '../deliveryOrderItem';

const baseSource = {
  id: 'item-1',
  product_id: 'product-1',
  product_name: 'Colchón doble',
  product_sku: 'COL-1',
  product_barcode: '7700001',
  warehouse_id: 'warehouse-1',
  warehouse_name: 'Principal',
  quantity: 10,
  delivered_quantity: 4,
  notes: '  Entregar con base  ',
};

describe('toDeliveryOrderItem', () => {
  it('etiqueta el grupo de las copias de una OE de cliente anidada en una remisión', () => {
    const copy = toDeliveryOrderItem({
      id: 'copy-1', product_id: 'p1', product_name: 'Nevera', product_sku: null, product_barcode: null,
      warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 2, delivered_quantity: 0,
      source_delivery_order_id: 'child-1', source_order_number: 'OE-0012', source_customer_name: 'Cliente Norte',
    });
    const own = toDeliveryOrderItem({
      id: 'own-1', product_id: 'p1', product_name: 'Nevera', product_sku: null, product_barcode: null,
      warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 2, delivered_quantity: 0,
    });

    expect(copy.group_label).toBe('OE-0012 · Cliente Norte');
    expect(own.group_label).toBeNull();
  });

  it('deriva pendiente y completado a partir de lo entregado', () => {
    const item = toDeliveryOrderItem(baseSource);

    expect(item.quantity).toBe(10);
    expect(item.delivered_quantity).toBe(4);
    expect(item.pending_quantity).toBe(6);
    expect(item.is_complete).toBe(false);
    expect(item.notes).toBe('Entregar con base');
  });

  it('marca la línea como completa cuando ya no queda pendiente', () => {
    const item = toDeliveryOrderItem({ ...baseSource, delivered_quantity: 10 });

    expect(item.pending_quantity).toBe(0);
    expect(item.is_complete).toBe(true);
  });

  it('nunca devuelve pendiente negativo si se entregó de más', () => {
    const item = toDeliveryOrderItem({ ...baseSource, delivered_quantity: 12 });

    expect(item.pending_quantity).toBe(0);
    expect(item.is_complete).toBe(true);
  });

  it('normaliza cantidades numéricas que llegan como texto o nulas', () => {
    const item = toDeliveryOrderItem({ ...baseSource, quantity: '7', delivered_quantity: null });

    expect(item.quantity).toBe(7);
    expect(item.delivered_quantity).toBe(0);
    expect(item.pending_quantity).toBe(7);
  });

  it('rellena los datos ausentes del producto y descarta notas vacías', () => {
    const item = toDeliveryOrderItem({
      ...baseSource,
      product_name: null,
      product_sku: null,
      product_barcode: null,
      warehouse_name: null,
      notes: '   ',
    });

    expect(item.product_name).toBe('Producto sin nombre');
    expect(item.product_sku).toBeNull();
    expect(item.product_barcode).toBeNull();
    expect(item.warehouse_name).toBeNull();
    expect(item.notes).toBeNull();
  });
});
