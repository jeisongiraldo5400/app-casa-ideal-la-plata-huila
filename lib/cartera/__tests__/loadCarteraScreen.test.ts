import { loadCarteraScreen } from '../loadCarteraScreen';
import { fetchCarteraDashboard, fetchCarteraPage } from '../carteraService';
import { fetchCarteraDashboardFromLocal } from '@/lib/offline/repositories/offlineRepository';

jest.mock('../carteraService', () => ({
  fetchCarteraPage: jest.fn(),
  fetchCarteraDashboard: jest.fn(),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  fetchCarteraDashboardFromLocal: jest.fn(),
}));

const mockedPage = fetchCarteraPage as jest.MockedFunction<typeof fetchCarteraPage>;
const mockedDashboard = fetchCarteraDashboard as jest.MockedFunction<typeof fetchCarteraDashboard>;
const mockedLocalDashboard = fetchCarteraDashboardFromLocal as jest.MockedFunction<
  typeof fetchCarteraDashboardFromLocal
>;

const params = {
  filter: 'todas' as const,
  search: '',
  page: 1,
  pageSize: 10,
  days: 15,
  municipioId: '',
  includeDashboard: true,
};

describe('loadCarteraScreen', () => {
  beforeEach(() => {
    mockedPage.mockReset();
    mockedDashboard.mockReset();
    mockedLocalDashboard.mockReset();
  });

  it('devuelve filas locales aunque el dashboard falle', async () => {
    mockedPage.mockResolvedValue({
      rows: [
        {
          cuota_id: 'q1',
          negocio_id: 'n1',
          negocio_numero: 12,
          customer_name: 'Ana',
          customer_id_number: '111',
          customer_phone: null,
          municipio_id: null,
          municipio_name: null,
          installment_number: 1,
          due_date: '2026-08-01',
          amount: 100,
          paid_amount: 0,
          late_fee_amount: 0,
          saldo: 100,
          status: 'pendiente',
          total_count: 1,
        },
      ],
      totalCount: 1,
      fromCache: true,
    });
    mockedDashboard.mockRejectedValue(new Error('Network request failed'));
    mockedLocalDashboard.mockResolvedValue(null);

    const result = await loadCarteraScreen(params);

    expect(result.rows).toHaveLength(1);
    expect(result.fromCache).toBe(true);
    expect(result.dashboard?.summary.total_balance).toBe(0);
  });
});
