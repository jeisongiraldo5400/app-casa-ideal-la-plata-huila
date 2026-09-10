import { supabase } from '@/lib/supabase';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import {
  canUseLocalDb,
  fetchCustomersPageFromLocal,
} from '@/lib/offline/repositories/offlineRepository';
import { claimCustomer, fetchCustomersPage } from '../customersDirectoryService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({ isNetworkError: jest.fn(() => false) }));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => true),
  countMyCustomersLocal: jest.fn(),
  fetchCustomerFromLocal: jest.fn(),
  fetchCustomerNegociosFromLocal: jest.fn(),
  fetchCustomersPageFromLocal: jest.fn(),
}));

const row = {
  id: 'c1',
  name: 'Ana',
  id_number: '1080',
  phone: '3001112233',
  email: null,
  address: null,
  municipio_name: 'La Plata',
  vereda_name: null,
  seller_id: 's1',
  seller_name: 'Vendedor Uno',
  total_exits: 0,
  last_exit_date: null,
  total_count: 3,
};

describe('fetchCustomersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isNetworkError as jest.Mock).mockReturnValue(false);
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
  });

  it('«Mis clientes» pide solo los del vendedor', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [row], error: null });

    const result = await fetchCustomersPage({ tab: 'mios', sellerId: 's1', search: '  ana ' });

    expect(supabase.rpc).toHaveBeenCalledWith('get_customers_dashboard', {
      search_term: 'ana',
      page: 1,
      page_size: 20,
      seller_ids: ['s1'],
      include_unassigned: false,
    });
    expect(result.totalCount).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.customers[0]).toMatchObject({ id: 'c1', seller_name: 'Vendedor Uno' });
  });

  it('«Todos» no envía el filtro de vendedor', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });

    await fetchCustomersPage({ tab: 'todos', sellerId: 's1' });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'get_customers_dashboard',
      expect.objectContaining({ seller_ids: undefined })
    );
  });

  it('en «Todos» se puede filtrar por otro vendedor', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });

    await fetchCustomersPage({ tab: 'todos', sellerId: 's1', filterSellerId: 's9' });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'get_customers_dashboard',
      expect.objectContaining({ seller_ids: ['s9'] })
    );
  });

  it('nunca expone las salidas: la RLS las deja en cero para un vendedor', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [row], error: null });

    const result = await fetchCustomersPage({ tab: 'mios', sellerId: 's1' });

    expect(result.customers[0]).not.toHaveProperty('total_exits');
    expect(result.customers[0]).not.toHaveProperty('last_exit_date');
  });

  it('propaga un error del RPC que no sea de red', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'RPC ausente' } });

    await expect(fetchCustomersPage({ tab: 'todos', sellerId: null })).rejects.toThrow('RPC ausente');
  });

  it('sin red lee la base local y lo marca como caché', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    (isNetworkError as jest.Mock).mockReturnValue(true);
    (fetchCustomersPageFromLocal as jest.Mock).mockResolvedValue({
      items: [{ id: 'c1', name: 'Ana', idNumber: '1080', phone: null, sellerId: 's1' }],
      totalCount: 1,
    });

    const result = await fetchCustomersPage({ tab: 'mios', sellerId: 's1' });

    expect(fetchCustomersPageFromLocal).toHaveBeenCalledWith(
      expect.objectContaining({ sellerId: 's1' })
    );
    expect(result.fromCache).toBe(true);
    expect(result.customers[0].id).toBe('c1');
  });
});

describe('claimCustomer', () => {
  function mockUpdate(result: { data: unknown; error: unknown }) {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const is = jest.fn().mockReturnValue({ select });
    const eq = jest.fn().mockReturnValue({ is });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });
    return { update, eq, is };
  }

  beforeEach(() => jest.clearAllMocks());

  it('solo reclama clientes sin vendedor', async () => {
    const chain = mockUpdate({ data: { id: 'c1' }, error: null });

    await claimCustomer('c1', 's1');

    expect(chain.update).toHaveBeenCalledWith({ seller_id: 's1' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'c1');
    // La guarda cierra la carrera con otro vendedor.
    expect(chain.is).toHaveBeenCalledWith('seller_id', null);
  });

  it('avisa cuando otro vendedor se adelantó', async () => {
    mockUpdate({ data: null, error: null });

    await expect(claimCustomer('c1', 's1')).rejects.toThrow('Este cliente ya tiene vendedor asignado.');
  });
});
