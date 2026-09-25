import { supabase } from '@/lib/supabase';
import { loadReportSnapshot, saveReportSnapshot } from '@/lib/offline/repositories/offlineRepository';
import {
  countUnsentPagosLocal,
  fetchProfileNameFromLocal,
  loadMisCobrosFromLocal,
} from '@/lib/offline/repositories/misCobrosRepository';
import { DEFAULT_MIS_COBROS_FILTERS, type LocalMisCobro } from '../misCobros';
import { CASH_METHODS_SNAPSHOT, fetchMisCobros, type MisCobrosQuery } from '../misCobrosService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  loadReportSnapshot: jest.fn(),
  saveReportSnapshot: jest.fn(),
}));
jest.mock('@/lib/offline/repositories/misCobrosRepository', () => ({
  countUnsentPagosLocal: jest.fn(),
  fetchProfileNameFromLocal: jest.fn(),
  loadMisCobrosFromLocal: jest.fn(),
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const mockedLoadLocal = loadMisCobrosFromLocal as jest.MockedFunction<typeof loadMisCobrosFromLocal>;
const mockedSnapshot = loadReportSnapshot as jest.MockedFunction<typeof loadReportSnapshot>;
const mockedSave = saveReportSnapshot as jest.MockedFunction<typeof saveReportSnapshot>;
const mockedUnsent = countUnsentPagosLocal as jest.MockedFunction<typeof countUnsentPagosLocal>;
const mockedName = fetchProfileNameFromLocal as jest.MockedFunction<typeof fetchProfileNameFromLocal>;

const QUERY: MisCobrosQuery = {
  filters: DEFAULT_MIS_COBROS_FILTERS,
  page: 1,
  pageSize: 20,
  collectorId: 'u1',
  collectorName: null,
  isSelf: true,
  online: true,
};

const SERVER = {
  summary: { total_count: 2, valid_count: 2, voided_count: 0, total_collected: '80000', total_cash: '50000', cash_count: 1 },
  rows: [
    {
      payment_id: 'p1', negocio_id: 'n1', negocio_numero: 20260007, customer_name: 'Ana', customer_id_number: '1',
      installment_number: 2, paid_at: '2026-09-10T15:00:00Z', amount: '50000', virtual_receipt_number: 'RV-1',
      receipt_number: null, receipt_status: 'emitido', payment_method_id: 'm1', payment_method_name: 'Efectivo',
      payment_method_is_cash: true, payment_site: 'app_movil', payment_kind: 'abono', cierre_numero: 'CR-2026-0003',
    },
  ],
  cash_method_ids: ['m1'],
};

const LOCAL: LocalMisCobro[] = [
  {
    payment_id: 'l1', negocio_id: 'n1', negocio_numero: 20260007, customer_name: 'Ana', customer_id_number: '1',
    installment_number: null, paid_at: '2026-09-20T15:00:00Z', amount: 7000, virtual_receipt_number: null,
    receipt_number: null, receipt_status: 'emitido', payment_method_id: 'm1', payment_method_name: 'Efectivo',
    payment_site: 'app_movil', payment_kind: 'abono', created_by_name: null, sync_status: 'pending',
  },
  {
    payment_id: 'l2', negocio_id: 'n1', negocio_numero: 20260007, customer_name: 'Ana', customer_id_number: '1',
    installment_number: 1, paid_at: '2026-09-01T15:00:00Z', amount: 3000, virtual_receipt_number: 'RV-9',
    receipt_number: null, receipt_status: 'emitido', payment_method_id: 'm2', payment_method_name: 'Consignación',
    payment_site: 'almacen', payment_kind: 'abono', created_by_name: 'Gestor Uno', sync_status: 'synced',
  },
];

describe('fetchMisCobros', () => {
  beforeEach(() => {
    rpc.mockReset();
    mockedLoadLocal.mockReset().mockResolvedValue(LOCAL);
    mockedSnapshot.mockReset().mockResolvedValue({ payload: ['m1'], pulledAt: 1 });
    mockedSave.mockReset().mockResolvedValue(undefined);
    mockedUnsent.mockReset().mockResolvedValue(1);
    mockedName.mockReset().mockResolvedValue('Gestor Uno');
  });

  it('con señal llama al RPC: lo propio va sin cobrador y solo con los filtros usados', async () => {
    rpc.mockResolvedValue({ data: SERVER, error: null });
    const page = await fetchMisCobros({
      ...QUERY,
      filters: { ...DEFAULT_MIS_COBROS_FILTERS, from: '2026-09-01', paymentMethodIds: ['m1', 'm2'], inCierre: 'no', status: 'vigentes', search: ' ana ' },
    });

    expect(rpc).toHaveBeenCalledWith('list_my_collected_payments', {
      p_collector_id: undefined,
      p_from: '2026-09-01',
      p_to: undefined,
      p_payment_method_ids: ['m1', 'm2'],
      p_payment_site: undefined,
      p_status: 'vigentes',
      p_in_cierre: false,
      p_search: 'ana',
      p_page: 1,
      p_page_size: 20,
    });
    expect(page.fromCache).toBe(false);
    expect(page.summary).toEqual({ total_count: 2, valid_count: 2, voided_count: 0, total_collected: 80000, total_cash: 50000, cash_count: 1 });
    expect(page.rows[0]).toMatchObject({ amount: 50000, payment_method_is_cash: true, cierre_numero: 'CR-2026-0003', local_state: null });
    expect(page.unsentCount).toBe(1);
    expect(mockedSave).toHaveBeenCalledWith(CASH_METHODS_SNAPSHOT, ['m1']);
    expect(mockedLoadLocal).not.toHaveBeenCalled();
  });

  it('el admin que consulta a otro cobrador envía su id', async () => {
    rpc.mockResolvedValue({ data: SERVER, error: null });
    const page = await fetchMisCobros({ ...QUERY, collectorId: 'g2', collectorName: 'Gestor Dos', isSelf: false });
    expect(rpc.mock.calls[0][1].p_collector_id).toBe('g2');
    expect(page.unsentCount).toBe(0);
    expect(mockedUnsent).not.toHaveBeenCalled();
  });

  it('sin señal usa los pagos del teléfono, incluidos los pendientes, y el efectivo guardado', async () => {
    const page = await fetchMisCobros({ ...QUERY, online: false, filters: { ...DEFAULT_MIS_COBROS_FILTERS, inCierre: 'si' } });

    expect(rpc).not.toHaveBeenCalled();
    expect(page.fromCache).toBe(true);
    expect(page.cierreFilterIgnored).toBe(true);
    expect(page.rows.map((row) => [row.payment_id, row.local_state])).toEqual([
      ['l1', 'pendiente'],
      ['l2', null],
    ]);
    expect(page.summary.total_collected).toBe(10000);
    expect(page.summary.total_cash).toBe(7000);
    expect(page.unsentCount).toBe(1);
  });

  it('si la petición no llega por falta de red, cae a lo guardado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    const page = await fetchMisCobros(QUERY);
    expect(page.fromCache).toBe(true);
    expect(page.rows).toHaveLength(2);
  });

  it('un rechazo del servidor (permiso) no se disfraza de datos locales', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Solo un administrador puede ver los cobros de otro usuario' } });
    await expect(fetchMisCobros({ ...QUERY, isSelf: false, collectorId: 'g2' })).rejects.toThrow('Solo un administrador');
    expect(mockedLoadLocal).not.toHaveBeenCalled();
  });

  it('pagina lo guardado igual que el servidor', async () => {
    const page = await fetchMisCobros({ ...QUERY, online: false, page: 2, pageSize: 1 });
    expect(page.rows.map((row) => row.payment_id)).toEqual(['l2']);
    expect(page.summary.total_count).toBe(2);
  });
});
