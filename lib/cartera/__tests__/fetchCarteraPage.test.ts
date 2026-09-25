import { fetchCarteraPage } from '../carteraService';
import { supabase } from '@/lib/supabase';
import { fetchCarteraFromLocal } from '@/lib/offline/repositories/offlineRepository';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: (error: unknown) => error instanceof Error && /network/i.test(error.message),
}));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  fetchCarteraFromLocal: jest.fn(),
  fetchCarteraDashboardFromLocal: jest.fn(),
  fetchMunicipiosFromLocal: jest.fn(),
  loadReportSnapshot: jest.fn(),
  saveReportSnapshot: jest.fn(),
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const local = fetchCarteraFromLocal as jest.MockedFunction<typeof fetchCarteraFromLocal>;

const query = {
  filter: 'vencidas' as const,
  search: '',
  days: 30,
  municipioId: '',
  page: 2,
  pageSize: 10,
};

describe('fetchCarteraPage', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: [], error: null });
    local.mockReset();
  });

  it('cada filtro llega a get_cartera_cuotas', async () => {
    await fetchCarteraPage({
      ...query,
      search: 'ana',
      municipioId: 'mun-1',
      sellerId: 'sel-1',
      customerSellerId: 'cli-sel-1',
      paymentMethodId: 'pm-1',
      gestorId: 'ges-1',
      dueFrom: '2025-01-01',
      dueTo: '2025-03-31',
    });

    expect(rpc).toHaveBeenCalledWith('get_cartera_cuotas', {
      p_filter: 'vencidas',
      p_days: 30,
      p_search: 'ana',
      p_page: 2,
      p_page_size: 10,
      p_municipio_id: 'mun-1',
      p_seller_id: 'sel-1',
      p_customer_seller_id: 'cli-sel-1',
      p_payment_method_id: 'pm-1',
      p_gestor_id: 'ges-1',
      p_due_from: '2025-01-01',
      p_due_to: '2025-03-31',
    });
  });

  it('los filtros vacíos viajan como null (sin filtro)', async () => {
    await fetchCarteraPage({ ...query, sellerId: '', gestorId: '' });
    expect(rpc).toHaveBeenCalledWith(
      'get_cartera_cuotas',
      expect.objectContaining({
        p_municipio_id: null,
        p_seller_id: null,
        p_customer_seller_id: null,
        p_payment_method_id: null,
        p_gestor_id: null,
        p_due_from: null,
        p_due_to: null,
      })
    );
  });

  it('con señal busca la cédula en el servidor, sin puntos', async () => {
    rpc.mockResolvedValue({
      data: [{ cuota_id: 'q', negocio_id: 'n', negocio_numero: 20260001, customer_id_number: '1023456', amount: '100', paid_amount: '0', saldo: '100', total_count: '1' }],
      error: null,
    });
    const result = await fetchCarteraPage({ ...query, search: '1.023.456' });
    expect(rpc).toHaveBeenCalledWith('get_cartera_cuotas', expect.objectContaining({ p_search: '1023456' }));
    expect(result.fromCache).toBe(false);
    expect(result.rows[0].customer_id_number).toBe('1023456');
    expect(local).not.toHaveBeenCalled();
  });

  it('sin señal busca en la base local con los mismos filtros', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    local.mockResolvedValue({ rows: [], totalCount: 0 });
    const result = await fetchCarteraPage({ ...query, search: '1.023.456', gestorId: 'ges-1' });
    expect(local).toHaveBeenCalledWith(expect.objectContaining({ search: '1.023.456', gestorId: 'ges-1', page: 2 }));
    expect(result.fromCache).toBe(true);
  });
});
