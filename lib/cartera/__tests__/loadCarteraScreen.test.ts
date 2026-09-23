import { loadCarteraScreen } from '../loadCarteraScreen';
import { fetchCarteraDashboard, fetchCarteraPage, markCuotasEnMora } from '../carteraService';
import { fetchCarteraDashboardFromLocal } from '@/lib/offline/repositories/offlineRepository';

jest.mock('../carteraService', () => ({
  fetchCarteraPage: jest.fn(),
  fetchCarteraDashboard: jest.fn(),
  markCuotasEnMora: jest.fn(),
}));

jest.mock('@/lib/offline/repositories/offlineRepository', () => ({
  fetchCarteraDashboardFromLocal: jest.fn(),
}));

const mockedPage = fetchCarteraPage as jest.MockedFunction<typeof fetchCarteraPage>;
const mockedDashboard = fetchCarteraDashboard as jest.MockedFunction<typeof fetchCarteraDashboard>;
const mockedLocalDashboard = fetchCarteraDashboardFromLocal as jest.MockedFunction<
  typeof fetchCarteraDashboardFromLocal
>;
const mockedMora = markCuotasEnMora as jest.MockedFunction<typeof markCuotasEnMora>;

/** Promesa que el test resuelve cuando quiere: sirve para observar el solapamiento. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const emptyPage = { rows: [], totalCount: 0, fromCache: false as const };

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
    mockedMora.mockReset();
    mockedMora.mockResolvedValue(undefined);
  });

  it('traslada el filtro por vendedor del cliente al servicio', async () => {
    mockedPage.mockResolvedValue({ rows: [], totalCount: 0, fromCache: false });
    mockedDashboard.mockResolvedValue(null as never);

    await loadCarteraScreen({ ...params, customerSellerId: 'seller-9', includeDashboard: false });

    expect(mockedPage).toHaveBeenCalledWith(
      expect.objectContaining({ customerSellerId: 'seller-9' })
    );
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
          seller_id: null,
          seller_name: null,
          customer_seller_id: null,
          customer_seller_name: null,
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
  it('marca la mora una sola vez por carga y antes de leer las cuotas', async () => {
    const order: string[] = [];
    mockedMora.mockImplementation(async () => {
      order.push('mora');
    });
    mockedPage.mockImplementation(async () => {
      order.push('cuotas');
      return emptyPage;
    });
    mockedDashboard.mockImplementation(async () => {
      order.push('tablero');
      return null as never;
    });

    await loadCarteraScreen(params);

    expect(mockedMora).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('mora');
    expect(order).toContain('cuotas');
    expect(order).toContain('tablero');
  });

  it('no vuelve a marcar la mora al paginar', async () => {
    mockedPage.mockResolvedValue(emptyPage);

    await loadCarteraScreen({ ...params, page: 2, includeDashboard: false });

    expect(mockedMora).not.toHaveBeenCalled();
    expect(mockedDashboard).not.toHaveBeenCalled();
  });

  it('pide listado y tablero en paralelo, sin esperar a que uno termine', async () => {
    const page = deferred<typeof emptyPage>();
    const dashboard = deferred<null>();
    mockedPage.mockReturnValue(page.promise as never);
    mockedDashboard.mockReturnValue(dashboard.promise as never);

    const pending = loadCarteraScreen(params);
    // La mora es lo único que se espera antes de leer; tras ella, las dos
    // consultas ya salieron aunque ninguna haya respondido.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedPage).toHaveBeenCalledTimes(1);
    expect(mockedDashboard).toHaveBeenCalledTimes(1);

    page.resolve(emptyPage);
    dashboard.resolve(null);
    await expect(pending).resolves.toMatchObject({ totalCount: 0 });
  });

  it('no deja el fallo del tablero sin capturar cuando el listado falla', async () => {
    mockedPage.mockRejectedValue(new Error('No fue posible cargar la cartera'));
    mockedDashboard.mockRejectedValue(new Error('Network request failed'));
    mockedLocalDashboard.mockRejectedValue(new Error('sin base local'));

    await expect(loadCarteraScreen(params)).rejects.toThrow();
  });
});
