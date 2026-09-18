import { supabase } from '@/lib/supabase';
import { fetchDeliveryOrderItemsForViewing } from '../deliveryOrderItemsService';
import { returnedQuantityGate } from '../returnedQuantityColumn';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;

describe('fetchDeliveryOrderItemsForViewing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    returnedQuantityGate.reset();
  });

  it('lee por el RPC de consulta, que responde a cualquier rol', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'li-1',
          product_id: 'p-1',
          warehouse_id: 'w-1',
          quantity: 5,
          delivered_quantity: 3,
          returned_quantity: 2,
          product_name: 'Cama',
          product_sku: 'sk1',
          product_barcode: 'bc1',
          warehouse_name: 'Principal',
          notes: 'Entregar en la tarde',
          source_delivery_order_id: null,
          source_order_number: null,
          source_customer_name: null,
        },
      ],
      error: null,
    });

    const items = await fetchDeliveryOrderItemsForViewing('oe-1');

    expect(rpc).toHaveBeenCalledWith('get_delivery_order_items_overview', { p_order_id: 'oe-1' });
    expect(from).not.toHaveBeenCalled();
    // Devolver cierra la línea: 3 entregadas + 2 devueltas cubren las 5 pedidas.
    expect(items[0]).toMatchObject({
      product_name: 'Cama',
      warehouse_name: 'Principal',
      returned_quantity: 2,
      resolved_quantity: 5,
      pending_quantity: 0,
      is_complete: true,
      notes: 'Entregar en la tarde',
    });
  });

  it('sin la migración cae a la tabla con RLS', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
    const builder: Record<string, unknown> = {};
    ['select', 'eq', 'is', 'returns'].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [
          {
            id: 'li-1',
            product_id: 'p-1',
            warehouse_id: 'w-1',
            quantity: 2,
            delivered_quantity: 0,
            returned_quantity: 0,
            notes: null,
            product: { name: 'Nevera', sku: 'sk2', barcode: 'bc2' },
            warehouse: { name: 'Principal' },
          },
        ],
        error: null,
      }).then(resolve);
    from.mockReturnValue(builder);

    const items = await fetchDeliveryOrderItemsForViewing('oe-1');

    expect(from).toHaveBeenCalledWith('delivery_order_items');
    expect(items[0]).toMatchObject({ product_name: 'Nevera', pending_quantity: 2, is_complete: false });
  });

  it('cualquier otro error del RPC se propaga sin tocar la tabla', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No autenticado' } });

    await expect(fetchDeliveryOrderItemsForViewing('oe-1')).rejects.toThrow('No autenticado');
    expect(from).not.toHaveBeenCalled();
  });
});
