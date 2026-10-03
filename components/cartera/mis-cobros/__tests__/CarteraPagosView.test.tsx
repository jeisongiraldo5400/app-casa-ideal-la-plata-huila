import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchCarteraPagos, type CarteraPagosPage } from '@/lib/cartera/misCobrosService';
import { formatCOP } from '@/lib/creditCalculator';
import { exportAndShareCarteraPagosExcel } from '@/lib/cartera/exportManagerPaymentsExcel';
import { CarteraPagosView } from '../CarteraPagosView';
import { bogotaDateValue } from '@/lib/localDate';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'gestor@casaideal.test' } }),
}));
let mockAdmin = false;
let mockGestor = false;
let mockVendedor = false;
let mockRecaudador = true;
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    isAdmin: () => mockAdmin,
    isGestorCobro: () => mockGestor,
    isVendedor: () => mockVendedor,
    isRecaudador: () => mockRecaudador,
  }),
}));
jest.mock('@/hooks/useScreenLoading', () => ({ useScreenLoading: () => undefined }));
let mockOnline = true;
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: (selector: (state: { online: boolean; lastSyncedAt: number | null }) => unknown) =>
    selector({ online: mockOnline, lastSyncedAt: null }),
}));
jest.mock('@/lib/offline/sync/downloadData', () => ({ formatLocalDataLabel: () => 'Datos locales' }));
jest.mock('@/lib/cartera/carteraCatalogs', () => ({
  loadCarteraCatalogs: jest.fn().mockResolvedValue({
    municipios: [],
    sellers: [],
    paymentMethods: [{ id: 'm1', name: 'Efectivo' }],
  }),
}));
jest.mock('@/lib/cartera/misCobrosService', () => ({ fetchCarteraPagos: jest.fn() }));
const mockShareReceipt = jest.fn();
const mockPrintReceipt = jest.fn();
const mockOpenSupport = jest.fn();
jest.mock('../useCobroReceiptActions', () => ({
  useCobroReceiptActions: () => ({
    shareReceipt: mockShareReceipt,
    printReceipt: mockPrintReceipt,
    openSupport: mockOpenSupport,
    printing: false,
  }),
}));
jest.mock('@/lib/cartera/exportManagerPaymentsExcel', () => ({ exportAndShareCarteraPagosExcel: jest.fn() }));

const mockedFetch = fetchCarteraPagos as jest.MockedFunction<typeof fetchCarteraPagos>;
const mockedExport = exportAndShareCarteraPagosExcel as jest.MockedFunction<typeof exportAndShareCarteraPagosExcel>;
const money = (value: number) => formatCOP(value);

const PAGE: CarteraPagosPage = {
  rows: [
    {
      payment_id: 'p1', negocio_id: 'n1', negocio_numero: 20260007, customer_name: 'Ana Pérez', customer_id_number: '1',
      installment_number: 2, paid_at: '2026-09-10T15:00:00Z', amount: 50000, virtual_receipt_number: 'RV-1',
      receipt_number: null, receipt_status: 'emitido', payment_method_id: 'm1', payment_method_name: 'Efectivo',
      payment_method_is_cash: true, payment_site: 'app_movil', payment_kind: 'abono', cierre_numero: 'CR-2026-0003', local_state: null,
    },
    {
      payment_id: 'p2', negocio_id: 'n2', negocio_numero: 20260008, customer_name: 'Luis Gómez', customer_id_number: '2',
      installment_number: null, paid_at: '2026-09-11T15:00:00Z', amount: 20000, virtual_receipt_number: null,
      receipt_number: null, receipt_status: 'anulado', payment_method_id: 'm1', payment_method_name: 'Efectivo',
      payment_method_is_cash: true, payment_site: 'app_movil', payment_kind: 'abono', cierre_numero: null, local_state: 'pendiente',
    },
  ],
  summary: { total_count: 2, valid_count: 1, voided_count: 1, total_collected: 50000, total_cash: 50000, cash_count: 1 },
  fromCache: false,
  cierreFilterIgnored: false,
  unsentCount: 0,
  scope: 'propios',
  collectors: [],
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <CarteraPagosView />
    </SafeAreaProvider>
  );
}

describe('CarteraPagosView (Cartera › Pagos)', () => {
  beforeEach(() => {
    mockAdmin = false;
    mockGestor = false;
    mockVendedor = false;
    mockRecaudador = true;
    mockOnline = true;
    mockPush.mockReset();
    mockShareReceipt.mockReset();
    mockPrintReceipt.mockReset();
    mockOpenSupport.mockReset();
    mockedExport.mockReset().mockResolvedValue({ fileName: 'Cobros.xlsx', rowCount: 2 });
    mockedFetch.mockReset().mockResolvedValue(PAGE);
  });

  it('carga los pagos con el alcance del rol y muestra totales, efectivo y marcas', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        viewer: { userId: 'u1', userName: null, isAdmin: false, isVendedor: false, isGestor: false },
        page: 1,
        online: true,
      })
    );
    expect(screen.getByTestId('pagos-alcance').props.children).toBe('Pagos que registraste');
    // Abre en «Hoy».
    const first = mockedFetch.mock.calls[0][0] as { filters: { from: string; to: string } };
    expect(first.filters.from).toBe(bogotaDateValue());
    expect(first.filters.to).toBe(bogotaDateValue());
    expect(screen.queryByText('Total recibido · todas las fechas')).toBeNull();
    expect(screen.getAllByText(money(50000)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Efectivo (1)')).toBeTruthy();
    expect(screen.getByText('En cierre CR-2026-0003')).toBeTruthy();
    expect(screen.getByText('Anulado')).toBeTruthy();
    expect(screen.getByText('Pendiente de enviar')).toBeTruthy();
    // Solo ve lo suyo: la tarjeta no repite quién registró.
    expect(screen.queryByText(/Registró /)).toBeNull();
  });

  it('la tarjeta de totales desglosa por método y se actualiza al cambiar filtros', async () => {
    mockedFetch
      .mockResolvedValueOnce({
        ...PAGE,
        summary: {
          ...PAGE.summary,
          total_collected: 157000,
          total_discount: 1000,
          pronto_pago_count: 1,
          total_voided: 20000,
          by_method: [
            { payment_method_id: 'm2', payment_method_name: 'Transferencia', is_cash: false, count: 2, total: 100000, total_discount: 0 },
            { payment_method_id: 'm1', payment_method_name: 'Efectivo', is_cash: true, count: 3, total: 50000, total_discount: 1000 },
            { payment_method_id: null, payment_method_name: null, is_cash: false, count: 1, total: 7000, total_discount: 0 },
          ],
        },
      })
      .mockResolvedValue({
        ...PAGE,
        summary: {
          ...PAGE.summary,
          by_method: [{ payment_method_id: 'm1', payment_method_name: 'Efectivo', is_cash: true, count: 1, total: 50000, total_discount: 0 }],
        },
      });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('mis-cobros-por-metodo')).toBeTruthy());
    expect(screen.getByText('Por método de pago')).toBeTruthy();
    expect(screen.getByText(money(100000))).toBeTruthy();
    expect(screen.getByText(' (2)')).toBeTruthy();
    expect(screen.getByText(money(7000))).toBeTruthy();
    expect(screen.getByText(/Sin método/)).toBeTruthy();
    expect(screen.getByText(/Descuentos por pronto pago: .*1\.000 \(1\)/)).toBeTruthy();
    expect(screen.getByText(`Anulado (no suma): ${money(20000)}`)).toBeTruthy();

    fireEvent.press(screen.getByText('Este mes'));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(money(100000))).toBeNull());
    expect(screen.queryByText(/Sin método/)).toBeNull();
    expect(screen.getByText(' (1)')).toBeTruthy();
  });

  it('sin desglose del servidor (versión anterior) no muestra la sección', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    expect(screen.queryByTestId('mis-cobros-por-metodo')).toBeNull();
  });

  it('el rango Desde/Hasta está a la vista y el total dice de qué fechas es', async () => {
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('mis-cobros-rango')).toBeTruthy();

    fireEvent.press(screen.getByText('Este mes'));

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
    const call = mockedFetch.mock.calls[1][0] as { filters: { from: string; to: string } };
    expect(call.filters.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(call.filters.to >= call.filters.from).toBe(true);
    expect(screen.getByText(/^Total recibido · /)).toBeTruthy();
    expect(screen.queryByText('Total recibido · todas las fechas')).toBeNull();
  });

  it('«Por entregar a caja»: efectivo vigente sin cierre de cualquier fecha, con su total', async () => {
    mockedFetch.mockResolvedValue({ ...PAGE, cashMethodIds: ['m1'] });
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('mis-cobros-por-entregar'));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
    const call = mockedFetch.mock.calls[1][0] as { filters: Record<string, unknown> };
    expect(call.filters).toEqual(
      expect.objectContaining({
        from: '',
        to: '',
        status: 'vigentes',
        inCierre: 'no',
        paymentMethodIds: ['m1'],
        createdBy: { id: 'u1', name: 'gestor@casaideal.test' },
      })
    );
    await waitFor(() => expect(screen.getByText(`${money(50000)} en efectivo sin cierre · 1 pago`)).toBeTruthy());

    // Tocar de nuevo vuelve a «Hoy».
    fireEvent.press(screen.getByTestId('mis-cobros-por-entregar'));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(3));
    expect((mockedFetch.mock.calls[2][0] as { filters: { from: string } }).filters.from).toBe(bogotaDateValue());
  });

  it('«Por entregar a caja» sin saber qué es efectivo lo explica', async () => {
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('mis-cobros-por-entregar'));
    expect(alert).toHaveBeenCalledWith('Por entregar a caja', expect.stringMatching(/métodos de pago son efectivo/));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('el segmento de estado vuelve a pedir con ese estado', async () => {
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    // El primero es el conteo de la tarjeta de totales; el segundo, el segmento de estado.
    fireEvent.press(screen.getAllByText('Anulados')[1]);
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ status: 'anulados' }) })
      )
    );
  });

  it('el vendedor (no cobra) no ve «Por entregar a caja»', async () => {
    mockRecaudador = false;
    mockVendedor = true;
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('mis-cobros-por-entregar')).toBeNull();
  });

  it('abre el negocio al tocar un pago', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());
    fireEvent.press(screen.getByText('Ana Pérez'));
    expect(mockPush).toHaveBeenCalledWith('/negocio/n1');
  });

  it('sin señal lo dice y explica el efectivo desconocido', async () => {
    mockOnline = false;
    mockedFetch.mockResolvedValue({
      ...PAGE,
      fromCache: true,
      cierreFilterIgnored: true,
      summary: { ...PAGE.summary, total_cash: null, cash_count: null },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText(/Sin señal: pagos guardados en el teléfono/)).toBeTruthy());
    expect(screen.getByText(/El filtro de cierre se aplica al volver la conexión/)).toBeTruthy();
    expect(screen.queryByText(/No incluye pagos de negocios ya cerrados/)).toBeNull();
    expect(screen.getByText('Sin dato')).toBeTruthy();
    expect(mockedFetch).toHaveBeenCalledWith(expect.objectContaining({ online: false }));
  });

  it('sin señal avisa que faltan los pagos de negocios ya cerrados', async () => {
    mockOnline = false;
    mockedFetch.mockResolvedValue({ ...PAGE, fromCache: true, closedNegociosMissing: true });
    renderScreen();
    await waitFor(() => expect(screen.getByText(/No incluye pagos de negocios ya cerrados/)).toBeTruthy());
  });

  it('con señal avisa de los pagos del teléfono aún sin enviar', async () => {
    mockedFetch.mockResolvedValue({ ...PAGE, unsentCount: 2 });
    renderScreen();
    await waitFor(() => expect(screen.getByText(/Hay 2 pagos guardados en el teléfono que aún no se envían/)).toBeTruthy());
  });

  it('un error del servidor se muestra como error, no como lista vacía', async () => {
    mockedFetch.mockRejectedValue(new Error('El rango de fechas es inválido'));
    renderScreen();
    await waitFor(() => expect(screen.getByText('No se pudieron cargar los pagos')).toBeTruthy());
    expect(screen.queryByText('Sin pagos para estos filtros')).toBeNull();
  });

  describe('alcance y «Registrado por»', () => {
    const CARTERA_PAGE: CarteraPagosPage = {
      ...PAGE,
      scope: 'cartera',
      collectors: [
        { id: 'u1', full_name: 'Yo mismo', count: 1 },
        { id: 'g2', full_name: 'Gestor Dos', count: 4 },
      ],
      rows: [{ ...PAGE.rows[0], created_by_name: 'Gestor Dos' }],
    };

    it('recaudador puro: sin filtro «Registrado por»', async () => {
      renderScreen();
      await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
      fireEvent.press(screen.getByText(/^Filtros/));
      expect(screen.queryByText('Registrado por')).toBeNull();
    });

    it('gestor: título de su cartera, cada pago dice quién lo registró y filtra por esa persona', async () => {
      mockGestor = true;
      mockRecaudador = false;
      mockedFetch.mockResolvedValue(CARTERA_PAGE);
      renderScreen();
      await waitFor(() => expect(screen.getByText('RV-1 · Registró Gestor Dos')).toBeTruthy());
      expect(screen.getByTestId('pagos-alcance').props.children).toBe('Pagos de tu cartera y los que registraste');

      fireEvent.press(screen.getByText(/^Filtros/));
      expect(screen.getByText('Registrado por')).toBeTruthy();
      expect(screen.getByLabelText('Yo')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Gestor Dos'));
      fireEvent.press(screen.getByText('Aplicar'));

      await waitFor(() =>
        expect(mockedFetch).toHaveBeenLastCalledWith(
          expect.objectContaining({ filters: expect.objectContaining({ createdBy: { id: 'g2', name: 'Gestor Dos' } }) })
        )
      );
      // La tarjeta y el resumen de filtros lo dicen.
      expect(screen.getAllByText(/Registró Gestor Dos$/)).toHaveLength(2);
    });

    it('admin: todos los pagos de la empresa', async () => {
      mockAdmin = true;
      mockedFetch.mockResolvedValue({ ...CARTERA_PAGE, scope: 'todos' });
      renderScreen();
      await waitFor(() => expect(screen.getByTestId('pagos-alcance').props.children).toBe('Todos los pagos de la empresa'));
      expect(mockedFetch).toHaveBeenCalledWith(expect.objectContaining({ viewer: expect.objectContaining({ isAdmin: true }) }));
    });
  });

  it('descarga el Excel con el alcance y los filtros vigentes', async () => {
    mockedFetch.mockResolvedValue({ ...PAGE, scope: 'cartera' });
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    // El primero es el conteo de la tarjeta de totales; el segundo, el segmento de estado.
    fireEvent.press(screen.getAllByText('Anulados')[1]);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));

    await waitFor(() =>
      expect(screen.getByLabelText('Descargar Excel de los pagos').props.accessibilityState.disabled).toBe(false)
    );
    fireEvent.press(screen.getByLabelText('Descargar Excel de los pagos'));

    await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1));
    expect(mockedExport).toHaveBeenCalledWith({
      filters: expect.objectContaining({ status: 'anulados', paymentMethodIds: [], inCierre: 'todos' }),
      context: { scope: 'cartera', paymentMethodsLabel: '' },
    });
  });

  it('comparte y reimprime el recibo de un cobro confirmado; los del teléfono no tienen recibo', async () => {
    mockedFetch.mockResolvedValue({
      ...PAGE,
      rows: [{ ...PAGE.rows[0], remaining_balance: 100000, created_by_name: 'Gestor', support_path: 'pagos/p1.jpg' }, PAGE.rows[1]],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());

    // Solo la fila confirmada por el servidor trae acciones.
    expect(screen.getAllByLabelText('Enviar PDF por WhatsApp')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Enviar PDF por WhatsApp'));
    expect(mockShareReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ receiptNumber: 'RV-1', amount: 50000, remainingBalance: 100000, registeredBy: 'Gestor' }),
      // La fila identifica el pago para registrar la impresión.
      expect.objectContaining({ negocio_id: 'n1', payment_id: 'p1' })
    );
    fireEvent.press(screen.getByLabelText('Reimprimir recibo'));
    expect(mockPrintReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ receiptNumber: 'RV-1' }),
      expect.objectContaining({ payment_id: 'p1' })
    );
    fireEvent.press(screen.getByLabelText('Ver soporte del pago'));
    expect(mockOpenSupport).toHaveBeenCalledWith('pagos/p1.jpg');
  });
});
