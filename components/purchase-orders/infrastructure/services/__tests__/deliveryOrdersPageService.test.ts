import { supabase } from '@/lib/supabase';
import { EMPTY_DELIVERY_LOCATION_FILTER } from '../../../domain/deliveryLocation';
import {
  DELIVERY_ORDERS_PAGE_SIZE,
  fetchDeliveryOrdersPage,
} from '../deliveryOrdersPageService';
import { returnedQuantityGate } from '../returnedQuantityColumn';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'oe-1',
    order_number: 'OE-2026-0001',
    order_type: 'customer',
    status: 'pending',
    notes: null,
    delivery_address: 'Calle 1',
    created_at: '2026-09-10T15:00:00Z',
    created_by: 'u-1',
    created_by_name: 'Administrador',
    customer_id: 'c-1',
    customer_name: 'Cliente Uno',
    customer_id_number: '111',
    customer_phone: '3000000001',
    customer_email: 'uno@x',
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assigned_to_user_email: null,
    departamento_id: 'dep-1',
    departamento_name: 'Antioquia',
    municipio_id: 'mun-1',
    municipio_name: 'Rionegro',
    vereda_id: null,
    vereda_name: null,
    total_items: 2,
    completed_items: 1,
    total_quantity: 9,
    delivered_quantity: 4,
    returned_quantity: 2,
    resolved_quantity: 6,
    pending_quantity: 3,
    has_more: false,
    ...overrides,
  };
}

const params = {
  search: '',
  location: EMPTY_DELIVERY_LOCATION_FILTER,
  cursor: null,
};

describe('fetchDeliveryOrdersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    returnedQuantityGate.reset();
  });

  it('pide 10 órdenes sin cursor y traduce los totales del servidor', async () => {
    rpc.mockResolvedValue({ data: [pageRow()], error: null });

    const page = await fetchDeliveryOrdersPage(params);

    expect(rpc).toHaveBeenCalledWith('get_delivery_orders_page', {
      p_search: null,
      p_status: 'all',
      p_order_type: 'all',
      p_departamento_id: null,
      p_municipio_id: null,
      p_vereda_id: null,
      p_limit: DELIVERY_ORDERS_PAGE_SIZE,
      p_cursor_created_at: null,
      p_cursor_id: null,
    });
    expect(page.serverPaginated).toBe(true);
    expect(page.orders).toHaveLength(1);
    // El avance de la tarjeta se mide en unidades resueltas: 6 de 9.
    expect(page.orders[0]).toMatchObject({
      id: 'oe-1',
      total_quantity: 9,
      delivered_quantity: 6,
      delivered_items: 1,
      total_items: 2,
      departamento_id: 'dep-1',
    });
  });

  it('manda el texto buscado y el filtro de ubicación al servidor', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await fetchDeliveryOrdersPage({
      search: '  rionegro ',
      location: { departamentoId: 'dep-1', municipioId: 'mun-1', veredaId: '' },
      cursor: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      'get_delivery_orders_page',
      expect.objectContaining({
        p_search: 'rionegro',
        p_departamento_id: 'dep-1',
        p_municipio_id: 'mun-1',
        p_vereda_id: null,
      }),
    );
  });

  it('devuelve el cursor de la última fila y si hay más páginas', async () => {
    rpc.mockResolvedValue({
      data: [
        pageRow({ id: 'oe-1', has_more: true }),
        pageRow({ id: 'oe-2', created_at: '2026-09-09T10:00:00Z', has_more: true }),
      ],
      error: null,
    });

    const page = await fetchDeliveryOrdersPage(params);

    expect(page.hasMore).toBe(true);
    expect(page.cursor).toEqual({ createdAt: '2026-09-09T10:00:00Z', id: 'oe-2' });
  });

  it('con la página siguiente envía el cursor recibido', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const page = await fetchDeliveryOrdersPage({
      ...params,
      cursor: { createdAt: '2026-09-09T10:00:00Z', id: 'oe-2' },
    });

    expect(rpc).toHaveBeenCalledWith(
      'get_delivery_orders_page',
      expect.objectContaining({
        p_cursor_created_at: '2026-09-09T10:00:00Z',
        p_cursor_id: 'oe-2',
      }),
    );
    // Sin filas nuevas el cursor se conserva: no se pierde la posición.
    expect(page.cursor).toEqual({ createdAt: '2026-09-09T10:00:00Z', id: 'oe-2' });
    expect(page.hasMore).toBe(false);
  });

  it('un error que no sea «la función no existe» se propaga', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No autenticado' } });

    await expect(fetchDeliveryOrdersPage(params)).rejects.toThrow('No autenticado');
  });

  describe('sin la migración aplicada (PGRST202)', () => {
    /** `from('delivery_orders')` y `from('delivery_order_items')` encadenados. */
    function mockTables(orders: unknown[], items: unknown[], profiles: unknown[] = []) {
      from.mockImplementation((table: string) => {
        const result =
          table === 'delivery_orders'
            ? { data: orders, error: null }
            : table === 'delivery_order_items'
              ? { data: items, error: null }
              : { data: profiles, error: null };
        const builder: Record<string, unknown> = {};
        ['select', 'is', 'in', 'order', 'limit', 'range', 'returns'].forEach((method) => {
          builder[method] = jest.fn(() => builder);
        });
        builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
        return builder;
      });
    }

    it('cae al camino antiguo y suma los avances leyendo las líneas', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
      mockTables(
        [
          {
            id: 'oe-1',
            created_at: '2026-09-10T15:00:00Z',
            created_by: 'u-1',
            customer_id: 'c-1',
            assigned_to_user_id: null,
            order_type: 'customer',
            delivery_address: 'Calle 1',
            notes: null,
            status: 'pending',
            order_number: 'OE-2026-0001',
            municipio_id: 'mun-1',
            vereda_id: null,
            customer: { name: 'Cliente Uno', id_number: '111', phone: null, email: null },
            assigned_to_user: null,
            municipio: { nombre: 'Rionegro', departamento_id: 'dep-1', departamento: { nombre: 'Antioquia' } },
            vereda: null,
          },
        ],
        [
          { delivery_order_id: 'oe-1', quantity: 5, delivered_quantity: 3, returned_quantity: 2 },
          { delivery_order_id: 'oe-1', quantity: 4, delivered_quantity: 1, returned_quantity: 0 },
        ],
        [{ id: 'u-1', full_name: 'Administrador', email: 'adm@x' }],
      );

      const page = await fetchDeliveryOrdersPage(params);

      expect(page.serverPaginated).toBe(false);
      expect(page.hasMore).toBe(false);
      expect(page.orders[0]).toMatchObject({
        id: 'oe-1',
        total_items: 2,
        total_quantity: 9,
        delivered_quantity: 6,
        delivered_items: 1,
        departamento_id: 'dep-1',
        created_by_name: 'Administrador',
      });
    });

    it('el camino antiguo aplica el filtro de ubicación en el teléfono', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
      mockTables(
        [
          {
            id: 'oe-1',
            created_at: '2026-09-10T15:00:00Z',
            created_by: null,
            customer_id: null,
            assigned_to_user_id: null,
            order_type: 'customer',
            delivery_address: null,
            notes: null,
            status: 'pending',
            order_number: 'OE-2026-0001',
            municipio_id: 'mun-1',
            vereda_id: null,
            customer: null,
            assigned_to_user: null,
            municipio: { nombre: 'Rionegro', departamento_id: 'dep-1', departamento: { nombre: 'Antioquia' } },
            vereda: null,
          },
        ],
        [],
      );

      const page = await fetchDeliveryOrdersPage({
        ...params,
        location: { departamentoId: 'dep-otro', municipioId: '', veredaId: '' },
      });

      expect(page.orders).toHaveLength(0);
    });

    it('el camino antiguo no tiene página siguiente: con cursor no pide nada', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
      mockTables([], []);

      const page = await fetchDeliveryOrdersPage({
        ...params,
        cursor: { createdAt: '2026-09-09T10:00:00Z', id: 'oe-2' },
      });

      expect(page.orders).toEqual([]);
      expect(page.hasMore).toBe(false);
      expect(from).not.toHaveBeenCalled();
    });
  });
});
