import { supabase } from '@/lib/supabase';
import { loadReportSnapshot, saveReportSnapshot } from '@/lib/offline/repositories/offlineRepository';
import {
  countUnsentPagosLocal,
  fetchProfileNameFromLocal,
  loadMisCobrosFromLocal,
} from '@/lib/offline/repositories/misCobrosRepository';
import { DEFAULT_MIS_COBROS_FILTERS, type LocalMisCobro } from '../misCobros';
import { CASH_METHODS_SNAPSHOT, fetchCarteraPagos, type CarteraPagosQuery } from '../misCobrosService';

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

/** Recaudador puro u1: sin señal solo ve lo que él registró. */
const QUERY: CarteraPagosQuery = {
  filters: DEFAULT_MIS_COBROS_FILTERS,
  page: 1,
  pageSize: 20,
  viewer: { userId: 'u1', userName: null, isAdmin: false, isVendedor: false, isGestor: false },
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

describe('fetchCarteraPagos (vista Pagos)', () => {
  beforeEach(() => {
    rpc.mockReset();
    mockedLoadLocal.mockReset().mockResolvedValue(LOCAL);
    mockedSnapshot.mockReset().mockResolvedValue({ payload: ['m1'], pulledAt: 1 });
    mockedSave.mockReset().mockResolvedValue(undefined);
    mockedUnsent.mockReset().mockResolvedValue(1);
    mockedName.mockReset().mockResolvedValue('Gestor Uno');
  });

  it('con señal llama a list_cartera_payments solo con los filtros usados', async () => {
    rpc.mockResolvedValue({ data: SERVER, error: null });
    const page = await fetchCarteraPagos({
      ...QUERY,
      filters: { ...DEFAULT_MIS_COBROS_FILTERS, from: '2026-09-01', paymentMethodIds: ['m1', 'm2'], inCierre: 'no', status: 'vigentes', search: ' ana ' },
    });

    expect(rpc).toHaveBeenCalledWith('list_cartera_payments', {
      p_date_from: '2026-09-01',
      p_date_to: undefined,
      p_payment_method_ids: ['m1', 'm2'],
      p_payment_site: undefined,
      p_created_by: undefined,
      p_search: 'ana',
      p_receipt_status: 'vigentes',
      p_in_cierre: false,
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

  it('mapea el desglose por método, descuentos y anulados del resumen (20261230130000)', async () => {
    rpc.mockResolvedValue({
      data: {
        ...SERVER,
        summary: {
          ...SERVER.summary,
          total_discount: '1000',
          pronto_pago_count: 1,
          total_voided: '30000',
          by_method: [
            { payment_method_id: 'm2', payment_method_name: 'Transferencia', is_cash: false, count: 1, total: '30000.00', total_discount: '0' },
            { payment_method_id: null, payment_method_name: null, is_cash: false, count: '1', total: '50000', total_discount: '1000' },
          ],
        },
      },
      error: null,
    });
    const page = await fetchCarteraPagos(QUERY);
    expect(page.summary.total_discount).toBe(1000);
    expect(page.summary.pronto_pago_count).toBe(1);
    expect(page.summary.total_voided).toBe(30000);
    expect(page.summary.by_method).toEqual([
      { payment_method_id: 'm2', payment_method_name: 'Transferencia', is_cash: false, count: 1, total: 30000, total_discount: 0 },
      { payment_method_id: null, payment_method_name: null, is_cash: false, count: 1, total: 50000, total_discount: 1000 },
    ]);
  });

  it('un servidor sin el desglose deja by_method sin definir (la pantalla lo oculta)', async () => {
    rpc.mockResolvedValue({ data: SERVER, error: null });
    const page = await fetchCarteraPagos(QUERY);
    expect(page.summary.by_method).toBeUndefined();
  });

  it('«Registrado por», sitio, estado y cierre llegan al RPC; trae alcance, quién registró y gestor', async () => {
    rpc.mockResolvedValue({
      data: {
        ...SERVER,
        scope: 'cartera',
        collectors: [{ id: 'g2', full_name: 'Gestor Dos', count: '3' }, { id: null }],
        rows: [{ ...SERVER.rows[0], created_by: 'g2', created_by_name: 'Gestor Dos', gestor_cobro_name: 'Gestor Dos' }],
      },
      error: null,
    });
    const page = await fetchCarteraPagos({
      ...QUERY,
      filters: {
        ...DEFAULT_MIS_COBROS_FILTERS,
        to: '2026-09-30',
        site: 'almacen',
        status: 'anulados',
        inCierre: 'si',
        createdBy: { id: 'g2', name: 'Gestor Dos' },
      },
    });
    expect(rpc.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        p_date_to: '2026-09-30',
        p_payment_site: 'almacen',
        p_receipt_status: 'anulados',
        p_in_cierre: true,
        p_created_by: 'g2',
      })
    );
    expect(page.scope).toBe('cartera');
    expect(page.collectors).toEqual([{ id: 'g2', full_name: 'Gestor Dos', count: 3 }]);
    expect(page.rows[0]).toMatchObject({ created_by: 'g2', created_by_name: 'Gestor Dos', gestor_cobro_name: 'Gestor Dos' });
  });

  it('sin alcance en la respuesta usa el de los roles', async () => {
    rpc.mockResolvedValue({ data: SERVER, error: null });
    expect((await fetchCarteraPagos(QUERY)).scope).toBe('propios');
    expect((await fetchCarteraPagos({ ...QUERY, viewer: { ...QUERY.viewer, isAdmin: true } })).scope).toBe('todos');
  });

  it('sin señal respeta el alcance del rol: el recaudador no ve pagos ajenos del teléfono', async () => {
    mockedLoadLocal.mockResolvedValue([
      ...LOCAL,
      { ...LOCAL[1], payment_id: 'l3', created_by_name: 'Otra', negocio_seller_id: 'u1' },
    ]);
    const recaudador = await fetchCarteraPagos({ ...QUERY, online: false });
    expect(recaudador.rows.map((row) => row.payment_id)).toEqual(['l1', 'l2']);
    expect(recaudador.scope).toBe('propios');
    expect(recaudador.collectors).toEqual([]);

    const vendedor = await fetchCarteraPagos({ ...QUERY, online: false, viewer: { ...QUERY.viewer, isVendedor: true } });
    expect(vendedor.rows.map((row) => row.payment_id).sort()).toEqual(['l1', 'l2', 'l3']);
    expect(vendedor.scope).toBe('cartera');
  });

  it('sin señal usa los pagos del teléfono, incluidos los pendientes, y el efectivo guardado', async () => {
    const page = await fetchCarteraPagos({ ...QUERY, online: false, filters: { ...DEFAULT_MIS_COBROS_FILTERS, inCierre: 'si' } });

    expect(rpc).not.toHaveBeenCalled();
    expect(page.fromCache).toBe(true);
    expect(page.cierreFilterIgnored).toBe(true);
    expect(page.rows.map((row) => [row.payment_id, row.local_state])).toEqual([
      ['l1', 'pendiente'],
      ['l2', null],
    ]);
    expect(page.summary.total_collected).toBe(10000);
    expect(page.summary.total_cash).toBe(7000);
    // El desglose por método también sale sin señal, con los pagos del teléfono.
    expect(page.summary.by_method?.reduce((total, method) => total + method.total, 0)).toBe(10000);
    expect(page.unsentCount).toBe(1);
    // Sin señal se sabe el efectivo guardado y se avisa de los negocios cerrados.
    expect(page.cashMethodIds).toEqual(['m1']);
    expect(page.closedNegociosMissing).toBe(true);
  });

  it('con señal trae el saldo tras cada pago y los métodos de efectivo', async () => {
    rpc.mockResolvedValue({
      data: { ...SERVER, rows: [{ ...SERVER.rows[0], remaining_balance: '20000', remaining_after_payment: '150000' }] },
      error: null,
    });
    const page = await fetchCarteraPagos(QUERY);
    expect(page.rows[0]).toMatchObject({ remaining_balance: 20000, remaining_after_payment: 150000 });
    expect(page.cashMethodIds).toEqual(['m1']);
    expect(page.closedNegociosMissing).toBeFalsy();
  });

  it('con señal trae a qué cuota fue el pago; sin el dato queda null (20261231190000)', async () => {
    rpc.mockResolvedValue({
      data: { ...SERVER, rows: [{ ...SERVER.rows[0], cuota_label: 'Cuotas 1–2 + Cuota 3 (parcial)' }, SERVER.rows[0]] },
      error: null,
    });
    const page = await fetchCarteraPagos(QUERY);
    expect(page.rows[0].cuota_label).toBe('Cuotas 1–2 + Cuota 3 (parcial)');
    expect(page.rows[1].cuota_label).toBeNull();
  });

  it('si la petición no llega por falta de red, cae a lo guardado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    const page = await fetchCarteraPagos(QUERY);
    expect(page.fromCache).toBe(true);
    expect(page.rows).toHaveLength(2);
  });

  it('un rechazo del servidor no se disfraza de datos locales', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'El rango de fechas es inválido' } });
    await expect(fetchCarteraPagos(QUERY)).rejects.toThrow('El rango de fechas es inválido');
    expect(mockedLoadLocal).not.toHaveBeenCalled();
  });

  it('pagina lo guardado igual que el servidor', async () => {
    const page = await fetchCarteraPagos({ ...QUERY, online: false, page: 2, pageSize: 1 });
    expect(page.rows.map((row) => row.payment_id)).toEqual(['l2']);
    expect(page.summary.total_count).toBe(2);
  });
});
