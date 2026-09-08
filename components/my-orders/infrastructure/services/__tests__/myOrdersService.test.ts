import { supabase } from '@/lib/supabase';
import {
  fetchMyRegisteredDeliveryOrderItems,
  fetchMyRegisteredDeliveryOrders,
} from '../myOrdersService';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const registeredOrder = {
  id: 'order-1',
  order_number: 'OE-1',
  order_type: 'customer',
  status: 'delivered',
  customer_id: 'customer-1',
  customer_name: 'Cliente',
  customer_id_number: '1',
  recipient_name: 'Cliente',
  recipient_type: 'customer',
  delivery_address: 'Calle 1',
  created_at: '2026-08-20T10:00:00Z',
  last_exit_at: '2026-08-21T10:00:00Z',
  total_items: 1,
  total_quantity: 2,
  delivered_quantity: 2,
  pending_quantity: 0,
  my_active_exit_count: 1,
  my_cancelled_exit_count: 0,
  my_active_quantity: 2,
  my_cancelled_quantity: 0,
  total_count: 21,
};

describe('myOrdersService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('solicita el historial paginado sin enviar un identificador de usuario', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [registeredOrder], error: null });

    const result = await fetchMyRegisteredDeliveryOrders({
      searchTerm: ' colchón ',
      page: 1,
      pageSize: 20,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('get_my_registered_delivery_orders', {
      p_search_term: 'colchón',
      p_page: 1,
      p_page_size: 20,
    });
    expect(result).toEqual({ orders: [registeredOrder], totalCount: 21, hasMore: true });
  });

  it('carga el detalle únicamente por el identificador de la orden', async () => {
    const item = {
      exit_id: 'exit-1',
      product_id: 'product-1',
      product_name: 'Colchón',
      product_sku: 'COL-1',
      product_barcode: '123',
      warehouse_id: 'warehouse-1',
      warehouse_name: 'Principal',
      quantity: 2,
      created_at: '2026-08-21T10:00:00Z',
      delivery_observations: null,
      is_cancelled: false,
      cancellation_observations: null,
    };
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [item], error: null });

    await expect(fetchMyRegisteredDeliveryOrderItems('order-1')).resolves.toEqual([item]);
    expect(supabase.rpc).toHaveBeenCalledWith('get_my_registered_delivery_order_items', {
      p_order_id: 'order-1',
    });
  });

  it('propaga un error visible cuando el RPC no está disponible', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'RPC ausente' } });

    await expect(fetchMyRegisteredDeliveryOrders({ searchTerm: '', page: 1, pageSize: 20 }))
      .rejects.toThrow('RPC ausente');
  });
});
