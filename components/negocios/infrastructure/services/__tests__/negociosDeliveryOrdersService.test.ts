import {
  deliveryOrderAvailabilityKey,
  isEligibleSourceDeliveryOrder,
  mapSoldQuantities,
  negocioSkipsWarehouseStock,
  stockMapFromDeliveryOrder,
  toDeliveryOrderOption,
} from '../negociosDeliveryOrdersService';

describe('origen de negocio desde orden de entrega', () => {
  it('separa saldo del mismo producto por bodega', () => {
    expect(
      deliveryOrderAvailabilityKey('oe-1', 'p1', 'w1')
    ).not.toBe(deliveryOrderAvailabilityKey('oe-1', 'p1', 'w2'));
  });

  it('excluye OE cliente ya ligada o enviada por remisión', () => {
    expect(
      isEligibleSourceDeliveryOrder({
        order_type: 'customer',
        status: 'pending',
        negocio_id: null,
      })
    ).toBe(true);
    expect(
      isEligibleSourceDeliveryOrder({
        order_type: 'customer',
        status: 'pending',
        negocio_id: 'n1',
      })
    ).toBe(false);
    expect(
      isEligibleSourceDeliveryOrder({
        order_type: 'customer',
        status: 'sent_by_remission',
        negocio_id: null,
      })
    ).toBe(false);
  });

  it('resta ventas previas solo en remisión', () => {
    const raw = {
      id: 'oe-1',
      order_number: '8',
      created_at: '2026-08-13T00:00:00Z',
      order_type: 'remission',
      status: 'pending',
      items: [
        {
          product_id: 'p1',
          warehouse_id: 'w1',
          quantity: 5,
          product: { name: 'Base', sale_price: 200 },
          warehouse: { name: 'Principal' },
        },
      ],
    };
    const sold = mapSoldQuantities([
      {
        remission_id: 'oe-1',
        negocio_items: [{ product_id: 'p1', warehouse_id: 'w1', quantity: 2 }],
      },
    ]);
    expect(toDeliveryOrderOption(raw, sold)?.items[0]?.available_quantity).toBe(3);
  });

  it('omite warehouse_stock si hay OE de origen', () => {
    expect(negocioSkipsWarehouseStock({ source_delivery_order_id: 'oe-1' })).toBe(true);
    expect(negocioSkipsWarehouseStock({})).toBe(false);
  });

  it('usa el saldo de la orden como stock aparente', () => {
    expect(
      stockMapFromDeliveryOrder({
        id: 'oe-1',
        order_number: '8',
        created_at: '2026-08-13T00:00:00Z',
        order_type: 'customer',
        status: 'pending',
        customer_id: 'c1',
        customer_name: 'Ana',
        customer_id_number: '1',
        assigned_user_name: null,
        items: [
          {
            product_id: 'p1',
            product_name: 'Base',
            warehouse_id: 'w1',
            warehouse_name: 'Principal',
            quantity: 5,
            available_quantity: 5,
            sale_price: 200,
          },
        ],
      })
    ).toEqual({
      p1: [{ warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 5 }],
    });
  });

  it('tolera relaciones anidadas en arreglo y items ausentes', () => {
    const option = toDeliveryOrderOption(
      {
        id: 'oe-2',
        order_number: '9',
        created_at: '2026-08-13T00:00:00Z',
        order_type: 'customer',
        status: 'pending',
        customer_id: 'c1',
        customer: [{ id: 'c1', name: 'Ana', id_number: '1' }],
        assigned_user: [{ full_name: 'Luis' }],
        items: {
          product_id: 'p1',
          warehouse_id: 'w1',
          quantity: 2,
          product: [{ name: 'Base', sale_price: 200 }],
          warehouse: [{ name: 'Principal' }],
        },
      },
      new Map()
    );

    expect(option?.customer_name).toBe('Ana');
    expect(option?.items).toHaveLength(1);
    expect(stockMapFromDeliveryOrder(null)).toEqual({});
  });
});
