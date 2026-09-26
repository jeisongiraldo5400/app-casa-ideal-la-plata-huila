import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchMisCobros } from '@/lib/cartera/misCobrosService';
import type { MisCobrosPage } from '@/lib/cartera/misCobros';
import { formatCOP } from '@/lib/creditCalculator';
import { MisCobrosScreen } from '../MisCobrosScreen';

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
jest.mock('@/hooks/useUserRoles', () => ({ useUserRoles: () => ({ isAdmin: () => mockAdmin }) }));
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
jest.mock('@/components/cartera/CollectionManagerPicker', () => ({ CollectionManagerPicker: () => null }));
jest.mock('@/lib/cartera/misCobrosService', () => ({ fetchMisCobros: jest.fn() }));

const mockedFetch = fetchMisCobros as jest.MockedFunction<typeof fetchMisCobros>;
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
    mockOnline = true;
    mockPush.mockReset();
    mockedFetch.mockReset().mockResolvedValue(PAGE);
  });

  it('carga los cobros propios y muestra totales, efectivo y marcas', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeTruthy());

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.objectContaining({ collectorId: 'u1', isSelf: true, collectorName: null, page: 1, online: true })
    );
    expect(screen.getByText('Total cobrado · todas las fechas')).toBeTruthy();
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
    expect(screen.getByText('Sin dato')).toBeTruthy();
    expect(mockedFetch).toHaveBeenCalledWith(expect.objectContaining({ online: false }));
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
});
