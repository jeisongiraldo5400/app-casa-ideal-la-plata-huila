import { supabase } from '@/lib/supabase';
import {
  DELIVERY_ORDER_SEARCH_LIMIT,
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
  searchAvailableDeliveryOrders,
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
          product: { name: 'Base' },
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
        municipio_id: null,
        vereda_id: null,
        delivery_address: null,
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
          product: [{ name: 'Base' }],
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

type Call = { table: string; method: string; args: unknown[] };

/**
 * Cliente falso de supabase-js: registra cada llamada del builder y resuelve
 * con lo que devuelva `respond(table)` al esperar la consulta.
 */
function mockSupabaseTables(respond: (table: string, calls: Call[]) => { data: unknown[]; error: null }) {
  const calls: Call[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const own: Call[] = [];
    const chain: Record<string, unknown> = {};
    ['select', 'in', 'is', 'neq', 'or', 'ilike', 'order', 'limit', 'eq'].forEach((method) => {
      chain[method] = (...args: unknown[]) => {
        const call = { table, method, args };
        calls.push(call);
        own.push(call);
        return chain;
      };
    });
    chain.range = () => Promise.resolve(respond(table, own));
    chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(respond(table, own)).then(resolve, reject);
    return chain;
  });
  return calls;
}

const customerOrder = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  order_number: `OE-2026-${id}`,
  created_at: '2026-09-01T00:00:00Z',
  order_type: 'customer',
  status: 'pending',
  customer_id: `c-${id}`,
  negocio_id: null,
  municipio_id: 'la-plata',
  vereda_id: null,
  delivery_address: ' Calle 5 ',
  customer: { id: `c-${id}`, name: 'Cliente', id_number: '123' },
  items: [{ product_id: 'p1', warehouse_id: 'w1', quantity: 2, deleted_at: null, product: { name: 'Base' }, warehouse: { name: 'Principal' } }],
  ...extra,
});

describe('searchAvailableDeliveryOrders', () => {
  beforeEach(() => jest.clearAllMocks());

  // Antes se descargaban todas y PostgREST cortaba en 1000 filas: con más de
  // 3000 órdenes, las antiguas nunca aparecían. Ahora se busca en el servidor.
  it('sin término pide sólo las más recientes, con tope', async () => {
    const calls = mockSupabaseTables((table) =>
      table === 'delivery_orders' ? { data: [customerOrder('1')], error: null } : { data: [], error: null }
    );

    const options = await searchAvailableDeliveryOrders('');

    const orderCalls = calls.filter((c) => c.table === 'delivery_orders');
    expect(orderCalls.some((c) => c.method === 'or')).toBe(false);
    expect(orderCalls.find((c) => c.method === 'limit')?.args[0]).toBeGreaterThanOrEqual(DELIVERY_ORDER_SEARCH_LIMIT);
    expect(calls.some((c) => c.table === 'customers' || c.table === 'profiles')).toBe(false);
    expect(options).toHaveLength(1);
  });

  it('con término busca por número de orden, cliente y asesor en el servidor', async () => {
    const calls = mockSupabaseTables((table) => {
      if (table === 'customers') return { data: [{ id: 'c-1' }, { id: 'c-2' }], error: null };
      if (table === 'profiles') return { data: [{ id: 'u-9' }], error: null };
      return { data: [customerOrder('1')], error: null };
    });

    await searchAvailableDeliveryOrders('3408');

    const orFilter = calls.find((c) => c.table === 'delivery_orders' && c.method === 'or')?.args[0];
    expect(orFilter).toBe('order_number.ilike.%3408%,customer_id.in.(c-1,c-2),assigned_to_user_id.in.(u-9)');
    expect(calls.find((c) => c.table === 'customers' && c.method === 'or')?.args[0]).toBe(
      'name.ilike.%3408%,id_number.ilike.%3408%'
    );
  });

  it('sin clientes ni asesores que coincidan, busca sólo por número', async () => {
    const calls = mockSupabaseTables((table) =>
      table === 'delivery_orders' ? { data: [], error: null } : { data: [], error: null }
    );

    await searchAvailableDeliveryOrders('OE-2026');

    expect(calls.find((c) => c.table === 'delivery_orders' && c.method === 'or')?.args[0]).toBe(
      'order_number.ilike.%OE-2026%'
    );
  });

  it('limpia el término antes de meterlo en el filtro', async () => {
    const calls = mockSupabaseTables(() => ({ data: [], error: null }));

    await searchAvailableDeliveryOrders('ana),status.eq.x%');

    // Sin comas ni paréntesis, «status.eq» queda como texto buscado y no puede
    // colarse como un filtro más: el .or() sigue teniendo una sola cláusula.
    const orFilter = String(calls.find((c) => c.table === 'delivery_orders' && c.method === 'or')?.args[0]);
    expect(orFilter).toBe('order_number.ilike.%ana status.eq.x%');
  });

  it('devuelve la ubicación de la orden para rellenar la del negocio', async () => {
    mockSupabaseTables((table) =>
      table === 'delivery_orders' ? { data: [customerOrder('1')], error: null } : { data: [], error: null }
    );

    const [option] = await searchAvailableDeliveryOrders('');

    expect(option).toEqual(
      expect.objectContaining({ municipio_id: 'la-plata', vereda_id: null, delivery_address: 'Calle 5' })
    );
  });

  it('muestra como máximo el límite aunque el servidor devuelva más', async () => {
    const many = Array.from({ length: 40 }, (_, i) => customerOrder(String(i)));
    mockSupabaseTables((table) =>
      table === 'delivery_orders' ? { data: many, error: null } : { data: [], error: null }
    );

    expect(await searchAvailableDeliveryOrders('')).toHaveLength(DELIVERY_ORDER_SEARCH_LIMIT);
  });

  it('resta lo ya vendido de las remisiones del resultado', async () => {
    const remission = {
      ...customerOrder('r1'),
      order_type: 'remission',
      customer_id: null,
      customer: null,
      items: [{ product_id: 'p1', warehouse_id: 'w1', quantity: 5, deleted_at: null, product: { name: 'Base' }, warehouse: { name: 'Principal' } }],
    };
    mockSupabaseTables((table) => {
      if (table === 'delivery_orders') return { data: [remission], error: null };
      if (table === 'negocios') {
        return {
          data: [{ remission_id: 'r1', source_delivery_order_id: null, negocio_items: [{ product_id: 'p1', warehouse_id: 'w1', quantity: 2 }] }],
          error: null,
        };
      }
      return { data: [], error: null };
    });

    const [option] = await searchAvailableDeliveryOrders('');

    expect(option.items[0]?.available_quantity).toBe(3);
  });
});
