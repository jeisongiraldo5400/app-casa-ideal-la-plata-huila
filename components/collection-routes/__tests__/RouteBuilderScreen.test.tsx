import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { RouteBuilderScreen } from '../RouteBuilderScreen';
import {
  createCollectionRoute,
  fetchAllRouteCandidates,
  fetchCollectionRoute,
  fetchMyCollectionRoutes,
  fetchRouteCandidates,
  setCollectionRouteStops,
} from '@/lib/collection-routes/collectionRouteService';
import { bogotaDateValue } from '@/lib/localDate';
import { addDaysToDateValue } from '@/lib/collection-routes/routeDates';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockOnline = true;
let mockParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: () => true, push: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock('../RouteLocationFilterModal', () => ({ RouteLocationFilterModal: () => null }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'g1' } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mockOnline }));
jest.mock('@/lib/locations/locationsService', () => ({
  fetchLocationMasters: async () => ({ departamentos: [], municipios: [], veredas: [] }),
}));
jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  fetchLocationCatalogsFromLocal: async () => ({ departamentos: [], municipios: [], veredas: [] }),
}));
jest.mock('@/lib/collection-routes/collectionRouteService', () => ({
  createCollectionRoute: jest.fn(),
  fetchAllRouteCandidates: jest.fn(),
  fetchCollectionRoute: jest.fn(),
  fetchMyCollectionRoutes: jest.fn(),
  fetchRouteCandidates: jest.fn(),
  setCollectionRouteStops: jest.fn(),
}));

const candidate = (id: string, name: string, total = 2) => ({
  negocio_id: id,
  negocio_numero: 20260000 + Number(id.slice(1)),
  customer_name: name,
  customer_id_number: null,
  customer_phone: null,
  customer_address: 'Calle 1',
  municipality_id: null,
  municipality_name: 'Rionegro',
  expected_balance: 100000,
  overdue_balance: 0,
  next_due_date: '2026-10-20',
  open_installments: 1,
  total_count: total,
  vereda_name: 'La Playa',
});

const mockedFetch = fetchRouteCandidates as jest.Mock;
const mockedAll = fetchAllRouteCandidates as jest.Mock;
const mockedCreate = createCollectionRoute as jest.Mock;
const mockedRoute = fetchCollectionRoute as jest.Mock;
const mockedSetStops = setCollectionRouteStops as jest.Mock;
const mockedMyRoutes = fetchMyCollectionRoutes as jest.Mock;
const TODAY = bogotaDateValue();
const TOMORROW = addDaysToDateValue(TODAY, 1);

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockParams = {};
  mockedMyRoutes.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockedFetch.mockResolvedValue({
    rows: [candidate('n1', 'José Peña'), candidate('n2', 'María López')],
    totalCount: 2,
    source: 'servidor',
  });
});

describe('RouteBuilderScreen', () => {
  it('parte de «Todos» los negocios asignados, no solo los de hoy', async () => {
    const screen = render(<RouteBuilderScreen />);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(mockedFetch.mock.calls[0][0].query.filter).toBe('todas');
    await screen.findByText('José Peña');
    screen.getByText('2 negocios · 0 en la ruta');
  });

  it('selecciona todos los filtrados, ordena y crea la ruta; luego ofrece descargarla', async () => {
    mockedAll.mockResolvedValue({ rows: [candidate('n1', 'José Peña'), candidate('n2', 'María López')], totalCount: 2 });
    mockedCreate.mockResolvedValue('route-9');
    const screen = render(<RouteBuilderScreen />);
    fireEvent.press(await screen.findByText('Seleccionar los 2 filtrados'));
    await screen.findByText('2 negocios · 2 en la ruta');

    fireEvent.press(screen.getByTestId('route-builder-review'));
    screen.getByText('Orden de visitas');
    fireEvent.press(screen.getByLabelText('Bajar José Peña'));
    fireEvent.press(screen.getByTestId('route-builder-save'));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(['n2', 'n1'], TODAY));
    expect(mockReplace).toHaveBeenCalledWith('/ruta-cobros/route-9?nueva=1');
  });

  it('quitar una parada desde el orden', async () => {
    const screen = render(<RouteBuilderScreen />);
    fireEvent.press(await screen.findByText('José Peña'));
    fireEvent.press(screen.getByText('María López'));
    fireEvent.press(screen.getByTestId('route-builder-review'));
    fireEvent.press(screen.getByLabelText('Quitar José Peña'));
    expect(screen.queryByText('José Peña')).toBeNull();
    screen.getByText('Crear ruta de hoy con 1 paradas');
  });

  it('sin señal lista lo descargado, conserva la selección y no deja guardar', async () => {
    mockOnline = false;
    mockedFetch.mockResolvedValue({ rows: [candidate('n1', 'José Peña', 1)], totalCount: 1, source: 'local' });
    const screen = render(<RouteBuilderScreen />);
    await screen.findByText(/Sin señal: ves los negocios descargados en el teléfono/);
    expect(mockedFetch.mock.calls[0][0].offline).toBe(true);
    fireEvent.press(screen.getByText('José Peña'));
    fireEvent.press(screen.getByTestId('route-builder-review'));
    screen.getByText('Sin señal: guarda cuando vuelva la conexión');
    expect(screen.getByTestId('route-builder-save').props.accessibilityState).toEqual({ disabled: true });
  });

  it('editar: parte de las paradas actuales y las visitas atendidas no se quitan', async () => {
    mockedRoute.mockResolvedValue({
      id: 'r1',
      stops: [
        { negocio_id: 'n1', negocio_numero: 20260001, customer_name: 'José Peña', customer_address: 'Calle', municipality_name: null, expected_balance: 1, status: 'cobrado' },
        { negocio_id: 'n2', negocio_numero: 20260002, customer_name: 'María López', customer_address: 'Calle', municipality_name: null, expected_balance: 1, status: 'pendiente' },
      ],
    });
    mockedSetStops.mockResolvedValue(undefined);
    const screen = render(<RouteBuilderScreen editRouteId="r1" />);
    await screen.findByText('Visita ya atendida');
    expect(screen.queryByLabelText('Quitar José Peña')).toBeNull();
    fireEvent.press(screen.getByLabelText('Subir María López'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('route-builder-save'));
    });
    expect(mockedSetStops).toHaveBeenCalledWith('r1', ['n2', 'n1']);
    expect(mockBack).toHaveBeenCalled();
  });

  describe('fecha de la ruta', () => {
    const toOrder = async (screen: ReturnType<typeof render>) => {
      fireEvent.press(await screen.findByText('José Peña'));
      fireEvent.press(screen.getByTestId('route-builder-review'));
    };

    it('se puede armar la ruta de mañana', async () => {
      mockedCreate.mockResolvedValue('route-10');
      const screen = render(<RouteBuilderScreen />);
      await toOrder(screen);
      fireEvent.press(screen.getByLabelText('Mañana'));
      screen.getByText('Crear ruta de mañana con 1 paradas');
      fireEvent.press(screen.getByTestId('route-builder-save'));
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(['n1'], TOMORROW));
    });

    it('si hoy ya tiene ruta, abre en mañana y no deja guardar para hoy', async () => {
      mockedMyRoutes.mockResolvedValue([{ id: 'r-hoy', route_date: TODAY, status: 'activa' }]);
      const screen = render(<RouteBuilderScreen />);
      await toOrder(screen);
      await screen.findByText('Crear ruta de mañana con 1 paradas');
      fireEvent.press(screen.getByLabelText('Hoy (ya tiene ruta)'));
      screen.getByText(/Ya tienes una ruta para hoy/);
      expect(screen.getByTestId('route-builder-save').props.accessibilityState).toEqual({ disabled: true });
    });

    it('una ruta cancelada no ocupa el día', async () => {
      mockedMyRoutes.mockResolvedValue([{ id: 'r-hoy', route_date: TODAY, status: 'cancelada' }]);
      const screen = render(<RouteBuilderScreen />);
      await toOrder(screen);
      await waitFor(() => expect(mockedMyRoutes).toHaveBeenCalled());
      screen.getByText('Crear ruta de hoy con 1 paradas');
    });

    it('abre con la fecha pedida desde Rutas (?fecha=)', async () => {
      mockParams = { fecha: TOMORROW };
      const screen = render(<RouteBuilderScreen />);
      await toOrder(screen);
      screen.getByText('Crear ruta de mañana con 1 paradas');
    });
  });
});
