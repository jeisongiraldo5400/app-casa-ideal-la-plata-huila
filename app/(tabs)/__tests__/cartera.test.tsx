import React from 'react';
import { FlatList, TextInput } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CarteraScreen from '../cartera';
import { loadCarteraScreen } from '@/lib/cartera/loadCarteraScreen';
import { loadCarteraCatalogs } from '@/lib/cartera/carteraCatalogs';
import { resetCarteraCache } from '@/lib/cartera/carteraCache';

const mockPush = jest.fn();
/** Última función que la pantalla registró en `useFocusEffect`: volver a llamarla es volver a la pantalla. */
let focusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void) => {
    const mockReact = jest.requireActual<typeof import('react')>('react');
    focusCallback = callback;
    mockReact.useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock('@/lib/cartera/loadCarteraScreen', () => ({ loadCarteraScreen: jest.fn() }));
jest.mock('@/lib/cartera/carteraCatalogs', () => ({
  EMPTY_CARTERA_CATALOGS: { municipios: [], sellers: [], paymentMethods: [] },
  loadCarteraCatalogs: jest.fn(),
}));

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
/** Se cambia en la prueba del recaudador; el resto de casos lo deja en false. */
let mockSoloBusqueda = false;
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    isAdmin: () => false,
    isGestorCobro: () => false,
    onlyFindsBySearch: () => mockSoloBusqueda,
  }),
}));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: (selector: (state: { lastSyncedAt: number | null }) => unknown) =>
    selector({ lastSyncedAt: null }),
}));
jest.mock('@/lib/offline/sync/downloadData', () => ({ formatLocalDataLabel: () => 'Datos locales' }));
jest.mock('@/components/offline', () => ({ DownloadDataButton: () => null }));
jest.mock('@/components/cartera/CollectionManagerPicker', () => ({ CollectionManagerPicker: () => null }));
jest.mock('@/components/cartera/mis-cobros/MisCobrosEntryButton', () => ({ MisCobrosEntryButton: () => null }));
jest.mock('@/components/cartera/CollectionManagerPaymentsModal', () => ({
  CollectionManagerPaymentsModal: () => null,
}));
/**
 * Modal de filtros de mentira: expone botones para simular el borrador, aplicar
 * y cerrar sin aplicar. El modal real se prueba en su propio archivo.
 */
jest.mock('@/components/cartera/CarteraFilterModal', () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    CarteraFilterModal: (props: {
      visible: boolean;
      values: Record<string, unknown>;
      onChange: (next: Record<string, unknown>) => void;
      onApply: () => void;
      onClose: () => void;
      showGestor?: boolean;
    }) =>
      props.visible
        ? mockReact.createElement(
            View,
            null,
            mockReact.createElement(
              Pressable,
              {
                onPress: () =>
                  props.onChange({
                    ...props.values,
                    filter: 'vencidas',
                    municipioId: 'mun-1',
                    gestorId: 'ges-1',
                    dueFrom: '2025-01-01',
                    dueTo: '2025-01-31',
                  }),
              },
              mockReact.createElement(Text, null, 'fake-borrador')
            ),
            mockReact.createElement(Pressable, { onPress: props.onApply }, mockReact.createElement(Text, null, 'fake-aplicar')),
            mockReact.createElement(Pressable, { onPress: props.onClose }, mockReact.createElement(Text, null, 'fake-cerrar')),
            props.showGestor ? mockReact.createElement(Text, null, 'fake-gestor') : null
          )
        : null,
    DEFAULT_CARTERA_FILTERS: {
      filter: 'todas',
      search: '',
      days: 15,
      municipioId: '',
      searchMunicipio: '',
      sellerId: '',
      searchSeller: '',
      customerSellerId: '',
      searchCustomerSeller: '',
      paymentMethodId: '',
      gestorId: '',
      gestorName: '',
      dueFrom: '',
      dueTo: '',
    },
  };
});

const mockedLoad = loadCarteraScreen as jest.MockedFunction<typeof loadCarteraScreen>;
const mockedCatalogs = loadCarteraCatalogs as jest.MockedFunction<typeof loadCarteraCatalogs>;

const row = {
  cuota_id: 'q1',
  negocio_id: 'n1',
  negocio_numero: 20260001,
  customer_name: 'Ana',
  customer_id_number: '111',
  customer_phone: null,
  municipio_id: null,
  municipio_name: null,
  seller_id: null,
  seller_name: null,
  customer_seller_id: null,
  customer_seller_name: null,
  installment_number: 1,
  due_date: '2026-09-01',
  amount: 100,
  paid_amount: 0,
  late_fee_amount: 0,
  saldo: 100,
  status: 'pendiente',
  total_count: 1,
};

const result = { rows: [row], totalCount: 1, fromCache: false, dashboard: null };

async function renderScreen() {
  const screen = render(<CarteraScreen />);
  await waitFor(() => expect(mockedLoad).toHaveBeenCalled());
  return screen;
}

describe('Pantalla de Cartera', () => {
  beforeEach(() => {
    resetCarteraCache();
    mockSoloBusqueda = false;
    focusCallback = null;
    mockPush.mockReset();
    mockedLoad.mockReset().mockResolvedValue(result);
    mockedCatalogs
      .mockReset()
      .mockResolvedValue({ municipios: [], sellers: [], paymentMethods: [] });
  });

  it('abre con una sola carga de pantalla y una sola de catálogos', async () => {
    await renderScreen();

    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad).toHaveBeenCalledWith(expect.objectContaining({ page: 1, includeDashboard: true }));
    await waitFor(() => expect(mockedCatalogs).toHaveBeenCalledTimes(1));
  });

  it('no vuelve a pedir nada al volver a la pantalla enseguida', async () => {
    await renderScreen();
    expect(mockedLoad).toHaveBeenCalledTimes(1);

    await act(async () => {
      focusCallback?.();
    });

    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('una pantalla recién montada siempre pide, aunque la marca de sesión siga fresca', async () => {
    const screen = await renderScreen();
    screen.unmount();

    await renderScreen();

    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('recarga de verdad al tirar para refrescar', async () => {
    const screen = await renderScreen();

    const list = screen.UNSAFE_getByType(FlatList);
    await act(async () => {
      (list.props.refreshControl as React.ReactElement<{ onRefresh: () => void }>).props.onRefresh();
    });

    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('al volver del detalle de un negocio (donde se registran pagos) sí recarga', async () => {
    const screen = await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByText(/Ana/));
    });
    expect(mockPush).toHaveBeenCalledWith('/negocio/n1');

    await act(async () => {
      focusCallback?.();
    });

    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  it('una carga fallida no se da por buena: al volver se reintenta', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('sin red'));
    await renderScreen();

    await act(async () => {
      focusCallback?.();
    });

    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });

  // Reportado por el usuario (2026-09-24): el recaudador veía toda la cartera.
  // Cobra en cualquier negocio, pero llega a él buscándolo.
  it('el recaudador no pide la cartera hasta que busca, y se le dice por qué', async () => {
    mockSoloBusqueda = true;

    const screen = render(<CarteraScreen />);

    await waitFor(() =>
      expect(screen.getByText(/Busca el negocio que vas a cobrar/i)).toBeTruthy()
    );
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Cobro por búsqueda')).toBeTruthy();
  });

  describe('buscador de cuotas', () => {
    it('está a la vista de todos y busca por cédula tras dejar de teclear', async () => {
      const screen = await renderScreen();
      const input = screen.getByLabelText('Buscar cuotas');

      fireEvent.changeText(input, '1.023.456');
      // Mientras se teclea no se consulta.
      expect(mockedLoad).toHaveBeenCalledTimes(1);

      await waitFor(() =>
        expect(mockedLoad).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: '1.023.456', page: 1, includeDashboard: true })
        )
      );
    });

    it('el campo no se remonta ni pierde lo escrito (espacio incluido) al recargar', async () => {
      const screen = await renderScreen();
      const input = screen.UNSAFE_getByType(TextInput);

      fireEvent.changeText(input, 'maria ');
      await waitFor(() => expect(mockedLoad).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'maria' })));

      const after = screen.UNSAFE_getByType(TextInput);
      expect(after).toBe(input);
      expect(after.props.value).toBe('maria ');
    });

    it('cada resultado muestra cliente, cédula, negocio, cuota, vencimiento, saldo y estado, y abre el negocio', async () => {
      mockedLoad.mockResolvedValue({
        ...result,
        rows: [{ ...row, customer_id_number: '1023456', status: 'mora', amount: 150, saldo: 100 }],
      });
      const screen = await renderScreen();

      expect(screen.getByText(/Ana · CC 1023456/)).toBeTruthy();
      expect(screen.getByText(/20260001/)).toBeTruthy();
      expect(screen.getByText(/Vence 2026-09-01/)).toBeTruthy();
      expect(screen.getByText('En mora')).toBeTruthy();
      expect(screen.getByText(/de \$\s?150/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByText(/Ana · CC/));
      });
      expect(mockPush).toHaveBeenCalledWith('/negocio/n1');
    });

    it('sin señal avisa que la búsqueda es sobre los datos del teléfono', async () => {
      mockedLoad.mockResolvedValue({ ...result, fromCache: true });
      const screen = await renderScreen();
      fireEvent.changeText(screen.getByLabelText('Buscar cuotas'), '1023456');

      await waitFor(() => expect(mockedLoad).toHaveBeenLastCalledWith(expect.objectContaining({ search: '1023456' })));
      expect(screen.getByText(/Sin señal: búsqueda y filtros/)).toBeTruthy();
    });

    it('sin resultados lo dice con el término buscado', async () => {
      const screen = await renderScreen();
      mockedLoad.mockResolvedValue({ rows: [], totalCount: 0, fromCache: false, dashboard: null });
      fireEvent.changeText(screen.getByLabelText('Buscar cuotas'), 'zzz');

      await waitFor(() => expect(screen.getByText('Sin cuotas para «zzz»')).toBeTruthy());
    });
  });

  describe('filtros', () => {
    async function applyDraft(screen: Awaited<ReturnType<typeof renderScreen>>) {
      fireEvent.press(screen.getByLabelText('Filtros'));
      fireEvent.press(screen.getByText('fake-borrador'));
      await act(async () => {
        fireEvent.press(screen.getByText('fake-aplicar'));
      });
    }

    it('al aplicar, cada filtro llega a la carga y la lista vuelve a la página 1', async () => {
      mockedLoad.mockResolvedValue({ ...result, totalCount: 20 });
      const screen = await renderScreen();

      await act(async () => {
        fireEvent.press(screen.getByText(/Cargar más/));
      });
      expect(mockedLoad).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, includeDashboard: false }));

      await applyDraft(screen);

      expect(mockedLoad).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          includeDashboard: true,
          filter: 'vencidas',
          municipioId: 'mun-1',
          gestorId: 'ges-1',
          dueFrom: '2025-01-01',
          dueTo: '2025-01-31',
        })
      );
    });

    it('muestra el contador de filtros activos y «Limpiar filtros» los quita conservando la búsqueda', async () => {
      const screen = await renderScreen();
      fireEvent.changeText(screen.getByLabelText('Buscar cuotas'), 'ana');
      await waitFor(() => expect(mockedLoad).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ana' })));

      await applyDraft(screen);
      // Estado, municipio, gestor y vencimiento.
      expect(screen.getByLabelText('Filtros, 4 activos')).toBeTruthy();
      expect(screen.getByText(/Vencidas · Municipio filtrado · Gestor filtrado · Vence del 01\/01\/2025 al 31\/01\/2025/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Limpiar filtros'));
      });

      expect(mockedLoad).toHaveBeenLastCalledWith(
        expect.objectContaining({ filter: 'todas', municipioId: '', gestorId: '', dueFrom: '', dueTo: '', search: 'ana', page: 1 })
      );
      expect(screen.getByLabelText('Filtros')).toBeTruthy();
      expect(screen.queryByLabelText('Limpiar filtros')).toBeNull();
    });

    it('cerrar sin aplicar descarta el borrador', async () => {
      const screen = await renderScreen();
      fireEvent.press(screen.getByLabelText('Filtros'));
      fireEvent.press(screen.getByText('fake-borrador'));
      await act(async () => {
        fireEvent.press(screen.getByText('fake-cerrar'));
      });

      expect(mockedLoad).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Filtros')).toBeTruthy();
    });

    it('el filtro por gestor solo se ofrece al administrador', async () => {
      const screen = await renderScreen();
      fireEvent.press(screen.getByLabelText('Filtros'));
      expect(screen.queryByText('fake-gestor')).toBeNull();
    });

    it('una respuesta vieja no pisa la de los filtros vigentes', async () => {
      let resolveOld!: (value: typeof result) => void;
      mockedLoad.mockReset().mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)));
      mockedLoad.mockResolvedValue({ ...result, rows: [{ ...row, cuota_id: 'q2', customer_name: 'Beto' }] });
      const screen = render(<CarteraScreen />);
      await waitFor(() => expect(mockedLoad).toHaveBeenCalledTimes(1));

      await applyDraft(screen);
      await waitFor(() => expect(screen.getByText(/Beto/)).toBeTruthy());

      await act(async () => {
        resolveOld(result);
      });
      expect(screen.queryByText(/Ana/)).toBeNull();
      expect(screen.getByText(/Beto/)).toBeTruthy();
    });
  });
});
