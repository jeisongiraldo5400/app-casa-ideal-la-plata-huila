import { supabase } from '@/lib/supabase';
import { fetchInventoryEntriesForOrders } from '../entriesQueries';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'eq', 'is']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain as Record<string, jest.Mock>;
}

describe('fetchInventoryEntriesForOrders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('solo devuelve recepciones PO_ENTRY: una devolución a proveedor no cuenta como recibido', async () => {
    // OC-2026-0010: 3 Lámparas recibidas y 1 devuelta al proveedor.
    const chain = query({
      data: [
        { purchase_order_id: 'o10', product_id: 'p1', quantity: 3, entry_type: 'PO_ENTRY' },
        { purchase_order_id: 'o10', product_id: 'p1', quantity: 1, entry_type: 'return' },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const rows = await fetchInventoryEntriesForOrders(['o10']);

    expect(supabase.from).toHaveBeenCalledWith('inventory_entries');
    expect(chain.in).toHaveBeenCalledWith('purchase_order_id', ['o10']);
    expect(chain.eq).toHaveBeenCalledWith('entry_type', 'PO_ENTRY');
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    expect(rows).toEqual([{ purchase_order_id: 'o10', product_id: 'p1', quantity: 3 }]);
  });

  it('sin órdenes no consulta', async () => {
    await expect(fetchInventoryEntriesForOrders([])).resolves.toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('propaga el error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(query({ data: null, error: new Error('sin red') }));
    await expect(fetchInventoryEntriesForOrders(['o1'])).rejects.toThrow('sin red');
  });
});
