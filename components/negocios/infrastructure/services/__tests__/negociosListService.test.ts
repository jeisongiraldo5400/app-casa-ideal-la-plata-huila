import { supabase } from '@/lib/supabase';
import { fetchLocationMasters } from '@/lib/locations/locationsService';
import { canUseLocalDb, fetchNegociosListFromLocal } from '@/lib/offline/repositories/offlineRepository';
import { getDatabase } from '@/lib/offline/database';
import { DEFAULT_NEGOCIOS_LIST_FILTERS } from '@/lib/negocios/negociosListQuery';
import { fetchNegociosFromLocal, fetchNegociosPage, loadLocationMastersForList } from '../negociosListService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/database', () => ({ getDatabase: jest.fn() }));
jest.mock('@/lib/offline/models', () => ({}));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  canUseLocalDb: jest.fn(() => false),
  fetchNegociosListFromLocal: jest.fn(),
}));
jest.mock('@/lib/localDate', () => ({ bogotaDateValue: () => '2026-09-25' }));
jest.mock('@/lib/locations/locationsService', () => ({
  EMPTY_LOCATION_MASTERS: { departamentos: [], municipios: [], veredas: [] },
  fetchLocationMasters: jest.fn(),
}));

const mockRpc = supabase.rpc as jest.Mock;

describe('negociosListService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama a list_negocios_movil con los filtros y traduce la respuesta', async () => {
    mockRpc.mockResolvedValue({
      data: {
        rows: [{ id: 'n1', numero: 20260001, status: 'activo', customer_name: 'Ana', remaining_balance: 10 }],
        summary: { total_count: 1, total_saldo: 10, mora_count: 0 },
      },
      error: null,
    });
    const page = await fetchNegociosPage({
      scope: 'por_cobrar',
      gestorId: 'gestor-2',
      search: '  ana ',
      filters: { ...DEFAULT_NEGOCIOS_LIST_FILTERS, departamentoId: 'd1', veredaId: 'v1', cobro: 'por_vencer', days: 15, order: 'atraso' },
      limit: 50,
      offset: 50,
    });
    expect(mockRpc).toHaveBeenCalledWith('list_negocios_movil', {
      p_scope: 'por_cobrar',
      p_gestor_id: 'gestor-2',
      p_search: 'ana',
      p_departamento_id: 'd1',
      p_municipio_id: undefined,
      p_vereda_id: 'v1',
      p_status: 'todos',
      p_cobro: 'por_vencer',
      p_days: 15,
      p_order: 'atraso',
      p_limit: 50,
      p_offset: 50,
    });
    expect(page.rows[0].customer.name).toBe('Ana');
    expect(page.summary).toEqual({ totalCount: 1, totalSaldo: 10, moraCount: 0 });
  });

  it('el gestor sólo viaja en «Por cobrar»', async () => {
    mockRpc.mockResolvedValue({ data: { rows: [], summary: {} }, error: null });
    await fetchNegociosPage({
      scope: 'todos',
      gestorId: 'gestor-2',
      search: '',
      filters: DEFAULT_NEGOCIOS_LIST_FILTERS,
      limit: 50,
      offset: 0,
    });
    expect(mockRpc.mock.calls[0][1].p_gestor_id).toBeUndefined();
  });

  it('propaga el error del servidor', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Sin permiso para consultar este gestor') });
    await expect(
      fetchNegociosPage({ scope: 'por_cobrar', gestorId: 'x', search: '', filters: DEFAULT_NEGOCIOS_LIST_FILTERS, limit: 50, offset: 0 })
    ).rejects.toThrow('Sin permiso');
  });

  it('sin base local devuelve null', async () => {
    (canUseLocalDb as jest.Mock).mockReturnValue(false);
    await expect(
      fetchNegociosFromLocal({ scope: 'todos', userId: 'u', gestorId: null, search: '', filters: DEFAULT_NEGOCIOS_LIST_FILTERS })
    ).resolves.toBeNull();
  });

  it('maestros de ubicación: si el servidor falla y no hay base local, quedan vacíos', async () => {
    (fetchLocationMasters as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    await expect(loadLocationMastersForList()).resolves.toEqual({ departamentos: [], municipios: [], veredas: [] });
  });

  it('sin señal completa la lista local con gestor, ubicación y cuotas, y filtra', async () => {
    (canUseLocalDb as jest.Mock).mockReturnValue(true);
    (fetchNegociosListFromLocal as jest.Mock).mockResolvedValue([
      { id: 'n1', numero: 20260001, status: 'activo', deal_date: '2026-09-01', total_credit: 100, remaining_balance: 0,
        customer_id: 'c1', customer: { name: 'José Peña', id_number: '1.061.111' }, installments_count: 1,
        has_mora: false, delivery_order_id: null, seller_id: 'v1' },
      { id: 'n2', numero: 20260002, status: 'activo', deal_date: '2026-09-02', total_credit: 100, remaining_balance: 0,
        customer_id: 'c2', customer: { name: 'Ana', id_number: '2' }, installments_count: 1,
        has_mora: false, delivery_order_id: null, seller_id: 'v1' },
    ]);
    const tables: Record<string, unknown[]> = {
      negocios: [
        { id: 'n1', createdBy: 'v1', gestorCobroId: 'g1', municipioId: null, direccion: null },
        { id: 'n2', createdBy: 'v1', gestorCobroId: 'g2', municipioId: 'm1', direccion: 'Finca' },
      ],
      customers: [{ id: 'c1', municipioId: 'm1', veredaId: 've1', address: 'Calle 1' }],
      negocio_cuotas: [
        { negocioId: 'n1', dueDate: '2026-09-05', installmentNumber: 1, amount: 100, paidAmount: 0, lateFeeAmount: 0, status: 'mora' },
      ],
      catalog_municipios: [{ id: 'm1', nombre: 'Álamo', departamentoId: 'd1', isActive: true }],
      catalog_veredas: [{ id: 've1', nombre: 'La Playa', municipioId: 'm1', isActive: true }],
      catalog_departamentos: [{ id: 'd1', nombre: 'Antioquia', isActive: true }],
    };
    (getDatabase as jest.Mock).mockReturnValue({
      get: (table: string) => ({ query: () => ({ fetch: async () => tables[table] ?? [] }) }),
    });

    const result = await fetchNegociosFromLocal({
      scope: 'por_cobrar',
      userId: 'g1',
      gestorId: null,
      search: '',
      filters: { ...DEFAULT_NEGOCIOS_LIST_FILTERS, veredaId: 've1' },
    });
    expect(result?.rows.map((row) => row.id)).toEqual(['n1']);
    expect(result?.rows[0]).toMatchObject({
      municipio_name: 'Álamo',
      vereda_name: 'La Playa',
      departamento_name: 'Antioquia',
      address: 'Calle 1',
      has_mora: true,
      dias_atraso: 20,
      remaining_balance: 100,
    });
    expect(result?.summary).toEqual({ totalCount: 1, totalSaldo: 100, moraCount: 1 });
  });
});
