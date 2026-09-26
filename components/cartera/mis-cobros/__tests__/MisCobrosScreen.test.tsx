import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchMisCobros } from '@/lib/cartera/misCobrosService';
import type { MisCobrosPage } from '@/lib/cartera/misCobros';
import { formatCOP } from '@/lib/creditCalculator';
import { exportAndShareManagerPaymentsExcel } from '@/lib/cartera/exportManagerPaymentsExcel';
import { MisCobrosScreen } from '../MisCobrosScreen';
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
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({ isAdmin: () => mockAdmin, isGestorCobro: () => mockGestor }),
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
/** Selector de mentira: un botón que elige a «Gestor Dos». */
jest.mock('@/components/cartera/CollectionManagerPicker', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CollectionManagerPicker: (props: { visible: boolean; onSelect: (m: { id: string; full_name: string }) => void }) =>
      props.visible
        ? ReactModule.createElement(
            Pressable,
            { onPress: () => props.onSelect({ id: 'g2', full_name: 'Gestor Dos' }) },
            ReactModule.createElement(Text, null, 'fake-elegir-gestor')
          )
        : null,
  };
});
jest.mock('@/lib/cartera/misCobrosService', () => ({
  fetchMisCobros: jest.fn(),
  receiptStatusParam: (status: string) => (status === 'vigentes' ? 'emitido' : status === 'anulados' ? 'anulado' : 'todos'),
}));
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
jest.mock('@/lib/cartera/exportManagerPaymentsExcel', () => ({ exportAndShareManagerPaymentsExcel: jest.fn() }));

const mockedFetch = fetchMisCobros as jest.MockedFunction<typeof fetchMisCobros>;
const mockedExport = exportAndShareManagerPaymentsExcel as jest.MockedFunction<typeof exportAndShareManagerPaymentsExcel>;
const money = (value: number) => formatCOP(value);

const PAGE: MisCobrosPage = {
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
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <MisCobrosScreen />
    </SafeAreaProvider>
  );
}

describe('MisCobrosScreen', () => {
  beforeEach(() => {
    mockAdmin = false;
    mockGestor = false;
    mockOnline = true;
    mockPush.mockReset();
    mockShareReceipt.mockReset();
    mockPrintReceipt.mockReset();
    mockOpenSupport.mockReset();
    mockedExport.mockReset().mockResolvedValue({ fileName: 'Cobros.xlsx', rowCount: 2 });
    mockedFetch.mockReset().mockResolvedValue(PAGE);
  });

  it('carga los cobros propios y muestra totales, efectivo y marcas', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: 'u1', isSelf: true, collectorName: null, page: 1, online: true })
    );
    // Abre en «Hoy».
    const first = mockedFetch.mock.calls[0][0] as { filters: { from: string; to: string } };
    expect(first.filters.from).toBe(bogotaDateValue());
    expect(first.filters.to).toBe(bogotaDateValue());
    expect(screen.queryByText('Total cobrado · todas las fechas')).toBeNull();
    expect(screen.getAllByText(money(50000)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Efectivo (1)')).toBeTruthy();
    expect(screen.getByText('En cierre CR-2026-0003')).toBeTruthy();
    expect(screen.getByText('Anulado')).toBeTruthy();
    expect(screen.getByText('Pendiente de enviar')).toBeTruthy();
    // Solo el administrador elige cobrador.
    expect(screen.queryByText('Cambiar')).toBeNull();
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
    expect(screen.getByText(/^Total cobrado · /)).toBeTruthy();
    expect(screen.queryByText('Total cobrado · todas las fechas')).toBeNull();
  });

  it('«Por entregar a caja»: efectivo vigente sin cierre de cualquier fecha, con su total', async () => {
    mockedFetch.mockResolvedValue({ ...PAGE, cashMethodIds: ['m1'] });
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('mis-cobros-por-entregar'));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
    const call = mockedFetch.mock.calls[1][0] as { filters: Record<string, unknown>; scope: string };
    expect(call.filters).toEqual(
      expect.objectContaining({ from: '', to: '', status: 'vigentes', inCierre: 'no', paymentMethodIds: ['m1'] })
    );
    expect(call.scope).toBe('performed');
    await waitFor(() => expect(screen.getByText(`${money(50000)} en efectivo sin cierre · 1 cobro`)).toBeTruthy());

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
    // El primero es el segmento; el segundo, la etiqueta del total de anulados.
    fireEvent.press(screen.getAllByText('Anulados')[0]);
    await waitFor(() =>
      expect(mockedFetch).toHaveBeenLastCalledWith(
        expect.objectContaining({ filters: expect.objectContaining({ status: 'anulados' }) })
      )
    );
  });

  it('abre el negocio al tocar un cobro', async () => {
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

  it('con señal avisa de los cobros del teléfono aún sin enviar', async () => {
    mockedFetch.mockResolvedValue({ ...PAGE, unsentCount: 2 });
    renderScreen();
    await waitFor(() => expect(screen.getByText(/Hay 2 cobros guardados en el teléfono que aún no se envían/)).toBeTruthy());
  });

  it('el administrador ve el selector de cobrador', async () => {
    mockAdmin = true;
    renderScreen();
    await waitFor(() => expect(screen.getByText('Cambiar')).toBeTruthy());
    expect(screen.getByText('Cobrador')).toBeTruthy();
  });

  it('un error del servidor se muestra como error, no como lista vacía', async () => {
    mockedFetch.mockRejectedValue(new Error('Solo un administrador puede ver los cobros de otro usuario'));
    renderScreen();
    await waitFor(() => expect(screen.getByText('No se pudieron cargar los cobros')).toBeTruthy());
    expect(screen.queryByText('Sin cobros para estos filtros')).toBeNull();
  });

  describe('alcance: cobrados por mí / de mi cartera', () => {
    it('quien no es gestor ni admin (recaudador) no ve el segmento y consulta lo registrado', async () => {
      renderScreen();
      await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('De mi cartera')).toBeNull();
      expect(mockedFetch).toHaveBeenCalledWith(expect.objectContaining({ scope: 'performed' }));
    });

    it('el gestor cambia a «De mi cartera»: pide ese alcance y cada cobro dice quién lo registró', async () => {
      mockGestor = true;
      renderScreen();
      await waitFor(() => expect(screen.getByText('Cobrados por mí')).toBeTruthy());
      expect(mockedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'performed', isSelf: true }));
      expect(screen.queryByText(/Registró /)).toBeNull();

      mockedFetch.mockResolvedValue({
        ...PAGE,
        rows: [{ ...PAGE.rows[0], created_by_name: 'Otra Persona' }],
      });
      fireEvent.press(screen.getByText('De mi cartera'));

      await waitFor(() =>
        expect(mockedFetch).toHaveBeenLastCalledWith(
          expect.objectContaining({ scope: 'portfolio', collectorId: 'u1', isSelf: true })
        )
      );
      await waitFor(() => expect(screen.getByText('RV-1 · Registró Otra Persona')).toBeTruthy());
      expect(screen.getByText(/negocios asignados hoy como gestor de cobro/)).toBeTruthy();
    });

    it('sin señal, «De mi cartera» explica que necesita conexión', async () => {
      mockGestor = true;
      renderScreen();
      await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
      mockedFetch.mockRejectedValue(new Error('Sin señal: los cobros de la cartera asignada se consultan con conexión.'));
      fireEvent.press(screen.getByText('De mi cartera'));
      await waitFor(() => expect(screen.getByText(/se consultan con conexión/)).toBeTruthy());
    });

    it('el admin elige otro cobrador y ve sus dos alcances', async () => {
      mockAdmin = true;
      renderScreen();
      await waitFor(() => expect(screen.getByText('Cambiar')).toBeTruthy());

      fireEvent.press(screen.getByText('Cambiar'));
      fireEvent.press(screen.getByText('fake-elegir-gestor'));

      await waitFor(() =>
        expect(mockedFetch).toHaveBeenLastCalledWith(
          expect.objectContaining({ collectorId: 'g2', collectorName: 'Gestor Dos', isSelf: false, scope: 'performed' })
        )
      );
      expect(screen.getByText('Gestor Dos')).toBeTruthy();
      fireEvent.press(screen.getByText('De su cartera'));
      await waitFor(() =>
        expect(mockedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ collectorId: 'g2', scope: 'portfolio' }))
      );
    });
  });

  it('descarga el Excel con el cobrador, el alcance y los filtros vigentes', async () => {
    mockGestor = true;
    renderScreen();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText('De mi cartera'));
    fireEvent.press(screen.getAllByText('Anulados')[0]);
    await waitFor(() => expect(mockedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'portfolio' })));

    // Mientras carga, el botón espera.
    await waitFor(() =>
      expect(screen.getByLabelText('Descargar Excel de los cobros').props.accessibilityState.disabled).toBe(false)
    );
    fireEvent.press(screen.getByLabelText('Descargar Excel de los cobros'));

    await waitFor(() => expect(mockedExport).toHaveBeenCalledTimes(1));
    expect(mockedExport).toHaveBeenCalledWith({
      manager: { id: 'u1', full_name: 'gestor@casaideal.test' },
      filters: expect.objectContaining({ scope: 'portfolio', receiptStatus: 'anulado', paymentMethodIds: [], inCierre: null }),
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
    expect(screen.getAllByLabelText('Compartir recibo en PDF')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Compartir recibo en PDF'));
    expect(mockShareReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ receiptNumber: 'RV-1', amount: 50000, remainingBalance: 100000, registeredBy: 'Gestor' })
    );
    fireEvent.press(screen.getByLabelText('Reimprimir recibo'));
    expect(mockPrintReceipt).toHaveBeenCalledWith(expect.objectContaining({ receiptNumber: 'RV-1' }));
    fireEvent.press(screen.getByLabelText('Ver soporte del pago'));
    expect(mockOpenSupport).toHaveBeenCalledWith('pagos/p1.jpg');
  });
});
