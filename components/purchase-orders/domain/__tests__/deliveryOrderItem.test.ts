import { pendingDeliveryQuantity, resolvedDeliveryQuantity, toDeliveryOrderItem } from '../deliveryOrderItem';

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

  it('cierra la línea cuando lo devuelto completa lo entregado', () => {
    // Caso real de OE-2026-3161: 3 unidades, 2 entregadas y 1 devuelta por el
    // cliente. La devuelta ya salió de bodega, así que la línea está resuelta.
    const item = toDeliveryOrderItem({ ...baseSource, quantity: 3, delivered_quantity: 2, returned_quantity: 1 });

    expect(item.delivered_quantity).toBe(2);
    expect(item.returned_quantity).toBe(1);
    expect(item.resolved_quantity).toBe(3);
    expect(item.pending_quantity).toBe(0);
    expect(item.is_complete).toBe(true);
  });

  it('con devolución parcial sigue quedando lo que falta por entregar', () => {
    const item = toDeliveryOrderItem({ ...baseSource, quantity: 10, delivered_quantity: 4, returned_quantity: 2 });

    expect(item.resolved_quantity).toBe(6);
    expect(item.pending_quantity).toBe(4);
    expect(item.is_complete).toBe(false);
  });

  it('trata la columna ausente o nula como cero devuelto', () => {
    const sinColumna = toDeliveryOrderItem({ ...baseSource, quantity: 3, delivered_quantity: 2 });
    const nula = toDeliveryOrderItem({ ...baseSource, quantity: 3, delivered_quantity: 2, returned_quantity: null });

    expect(sinColumna.returned_quantity).toBe(0);
    expect(sinColumna.pending_quantity).toBe(1);
    expect(nula.returned_quantity).toBe(0);
    expect(nula.pending_quantity).toBe(1);
  });

  it('nunca cuenta más de lo pedido aunque los contadores vengan inflados', () => {
    expect(resolvedDeliveryQuantity(3, 3, 3)).toBe(3);
    expect(pendingDeliveryQuantity(3, 3, 3)).toBe(0);
    expect(resolvedDeliveryQuantity(3, -1, -1)).toBe(0);
    expect(pendingDeliveryQuantity(3, 0, 0)).toBe(3);
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
