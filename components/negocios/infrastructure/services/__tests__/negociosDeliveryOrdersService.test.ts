import { supabase } from '@/lib/supabase';
import {
  deliveryOrderAvailabilityKey,
  fetchPendingRemissions,
  fetchRemissionOriginProducts,
  formatPendingRemissionLabel,
  isEligibleSourceDeliveryOrder,
  mapPendingRemissionRows,
  mapRemissionOriginRows,
  mapSoldQuantities,
  negocioSkipsWarehouseStock,
  parseRemissionOriginRows,
  REMISSION_OWN_GROUP_LABEL,
  stockMapFromDeliveryOrder,
  toDeliveryOrderOption,
  type RemissionOriginRow,
} from '../negociosDeliveryOrdersService';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const mockRpc = supabase.rpc as jest.Mock;

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

describe('remisiones pendientes (destino de la OE del negocio)', () => {
  beforeEach(() => mockRpc.mockReset());

  it('formatea la etiqueta como número · asignado · zona', () => {
    expect(
      formatPendingRemissionLabel({
        id: 'r1',
        order_number: 'OE-2026-0012',
        assigned_to_user_id: 'u1',
        assigned_user_name: 'Luis',
        zone_name: 'Norte',
        created_at: '',
        notes: null,
      })
    ).toBe('OE-2026-0012 · Luis · Norte');
    expect(
      formatPendingRemissionLabel({
        id: 'r1',
        order_number: 'OE-2026-0012',
        assigned_to_user_id: null,
        assigned_user_name: null,
        zone_name: null,
        created_at: '',
        notes: null,
      })
    ).toBe('OE-2026-0012 · sin asignar');
  });

  it('mapea filas del RPC y descarta las que no traen id', () => {
    expect(
      mapPendingRemissionRows([{ id: 'r1', order_number: 'OE-1' }, { order_number: 'x' }, null])
    ).toEqual([expect.objectContaining({ id: 'r1', order_number: 'OE-1' })]);
    expect(mapPendingRemissionRows(undefined)).toEqual([]);
  });

  it('fetchPendingRemissions llama a list_pending_remissions y propaga el error', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ id: 'r1', order_number: 'OE-1' }], error: null });
    await expect(fetchPendingRemissions()).resolves.toEqual([expect.objectContaining({ id: 'r1' })]);
    expect(mockRpc).toHaveBeenCalledWith('list_pending_remissions', undefined);

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchPendingRemissions()).rejects.toThrow('boom');
  });
});

describe('grupos de origen de una remisión', () => {
  const row = (patch: Partial<RemissionOriginRow>): RemissionOriginRow => ({
    group_kind: 'own',
    source_delivery_order_id: null,
    source_order_number: null,
    source_customer_id: null,
    source_customer_name: null,
    source_has_negocio: false,
    product_id: 'p1',
    product_name: 'Base',
    sale_price: 200,
    warehouse_id: 'w1',
    warehouse_name: 'Principal',
    quantity: 5,
    available_quantity: 5,
    ...patch,
  });

  beforeEach(() => mockRpc.mockReset());

  it('separa propios de cada OE hija, propios primero e hijas por número', () => {
    const groups = mapRemissionOriginRows('rem-1', [
      row({
        group_kind: 'child',
        source_delivery_order_id: 'oe-b',
        source_order_number: 'OE-0020',
        source_customer_id: 'c2',
        source_customer_name: 'Beatriz',
      }),
      row({ group_kind: 'own' }),
      row({
        group_kind: 'child',
        source_delivery_order_id: 'oe-a',
        source_order_number: 'OE-0010',
        source_customer_id: 'c1',
        source_customer_name: 'Ana',
        product_id: 'p2',
      }),
    ]);

    expect(groups.map((g) => [g.kind, g.sourceOrderId])).toEqual([
      ['own', 'rem-1'],
      ['child', 'oe-a'],
      ['child', 'oe-b'],
    ]);
    expect(groups[0]?.label).toBe(REMISSION_OWN_GROUP_LABEL);
    expect(groups[1]).toMatchObject({
      label: 'Productos de la OE-0010 (Ana)',
      customerId: 'c1',
      hasNegocio: false,
    });
  });

  it('conserva deshabilitada la OE hija con negocio y omite propios sin saldo', () => {
    const groups = mapRemissionOriginRows('rem-1', [
      row({ group_kind: 'own', available_quantity: 0 }),
      row({
        group_kind: 'child',
        source_delivery_order_id: 'oe-a',
        source_order_number: 'OE-0010',
        source_has_negocio: true,
      }),
      row({
        group_kind: 'child',
        source_delivery_order_id: 'oe-b',
        source_order_number: 'OE-0011',
        available_quantity: 0,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'child', sourceOrderId: 'oe-a', hasNegocio: true });
  });

  it('usa el saldo del grupo como stock aparente', () => {
    const [own] = mapRemissionOriginRows('rem-1', [
      row({ available_quantity: 3 }),
      row({ warehouse_id: 'w2', warehouse_name: 'Auxiliar', available_quantity: 0 }),
    ]);
    expect(stockMapFromDeliveryOrder(own ?? null)).toEqual({
      p1: [{ warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 3 }],
    });
  });

  it('parseRemissionOriginRows tolera filas incompletas', () => {
    expect(
      parseRemissionOriginRows([
        { group_kind: 'child', product_id: 'p1', warehouse_id: 'w1', quantity: '4', available_quantity: '2' },
        { group_kind: 'own', warehouse_id: 'w1' },
      ])
    ).toEqual([expect.objectContaining({ group_kind: 'child', quantity: 4, available_quantity: 2 })]);
  });

  it('fetchRemissionOriginProducts llama a get_remission_origin_products con la remisión', async () => {
    mockRpc.mockResolvedValueOnce({ data: [row({})], error: null });

    const groups = await fetchRemissionOriginProducts('rem-1');

    expect(mockRpc).toHaveBeenCalledWith('get_remission_origin_products', { p_remission_id: 'rem-1' });
    expect(groups).toEqual([expect.objectContaining({ kind: 'own', sourceOrderId: 'rem-1' })]);
  });
});
