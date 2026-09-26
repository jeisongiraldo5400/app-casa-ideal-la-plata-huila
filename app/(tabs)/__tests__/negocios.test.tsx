/**
 * Negocios unificado: pestañas por rol (Todos / Míos / Por cobrar), buscador,
 * filtros, resumen, admin eligiendo gestor, recaudador que sólo busca, modo
 * sin conexión y la ruta vieja de «Mis negocios».
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import NegociosScreen from '../negocios';
import MisNegociosRedirect from '../mis-negocios';
import {
  fetchNegociosFromLocal,
  fetchNegociosPage,
  loadLocationMastersForList,
} from '@/components/negocios/infrastructure/services/negociosListService';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockRedirectHref: unknown = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => {
    const mockReact = jest.requireActual<typeof import('react')>('react');
    mockReact.useEffect(() => {
      callback();
    }, [callback]);
  },
  Redirect: (props: { href: unknown }) => {
    mockRedirectHref = props.href;
    return null;
  },
}));

type Roles = { admin: boolean; vendedor: boolean; gestor: boolean; soloBusqueda: boolean };
let mockRoles: Roles = { admin: false, vendedor: false, gestor: true, soloBusqueda: false };
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    isAdmin: () => mockRoles.admin,
    isVendedor: () => mockRoles.vendedor,
    isGestorCobro: () => mockRoles.gestor,
    onlyFindsBySearch: () => mockRoles.soloBusqueda,
    isRecaudador: () => mockRoles.soloBusqueda,
  }),
}));
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' } }),
}));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@/hooks/useScreenLoading', () => ({ useScreenLoading: () => undefined }));
jest.mock('@/lib/offline/store/syncStore', () => ({
  useSyncStore: (selector: (state: { lastSyncedAt: number | null; setQueueVisible: () => void }) => unknown) =>
    selector({ lastSyncedAt: null, setQueueVisible: () => undefined }),
}));
jest.mock('@/lib/offline/sync/downloadData', () => ({ formatLocalDataLabel: () => 'Datos del teléfono' }));
jest.mock('@/components/offline', () => ({ DownloadDataButton: () => null }));
jest.mock('@/components/offline/NotOnPhoneNotice', () => ({ NotOnPhoneNotice: () => null }));
jest.mock('@/components/negocios/infrastructure/hooks/useNegocioSyncOverlay', () => ({
  useNegocioSyncOverlay: () => ({ states: {}, items: [] }),
}));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({
  isNetworkError: (error: unknown) => error instanceof Error && /network/i.test(error.message),
}));
jest.mock('@/components/negocios/infrastructure/services/negociosListService', () => ({
  fetchNegociosPage: jest.fn(),
  fetchNegociosFromLocal: jest.fn(),
  loadLocationMastersForList: jest.fn(),
}));
/** Selector de gestor de mentira: un botón que elige a «Gestor Dos». */
jest.mock('@/components/cartera/CollectionManagerPicker', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    CollectionManagerPicker: (props: { visible: boolean; onSelect: (m: { id: string; full_name: string }) => void }) =>
      props.visible
        ? mockReact.createElement(
            Pressable,
            { onPress: () => props.onSelect({ id: 'gestor-2', full_name: 'Gestor Dos' }) },
            mockReact.createElement(Text, null, 'fake-elegir-gestor')
          )
        : null,
  };
});
/** Hoja de filtros de mentira: aplica municipio + en mora + orden por saldo. */
jest.mock('@/components/negocios/components/NegociosFilterSheet', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const mockReact = jest.requireActual<typeof import('react')>('react');
  return {
    NegociosFilterSheet: (props: {
      visible: boolean;
      value: Record<string, unknown>;
      onApply: (next: Record<string, unknown>) => void;
    }) =>
      props.visible
        ? mockReact.createElement(
            Pressable,
            {
              onPress: () =>
                props.onApply({ ...props.value, departamentoId: 'd1', municipioId: 'm1', cobro: 'en_mora', order: 'saldo' }),
            },
            mockReact.createElement(Text, null, 'fake-aplicar-filtros')
          )
        : null,
  };
});

const mockPage = fetchNegociosPage as jest.Mock;
const mockLocal = fetchNegociosFromLocal as jest.Mock;

const serverRow = {
  id: 'n1',
  numero: 20260001,
  status: 'activo',
  deal_date: '2026-09-01',
  created_at: null,
  installments_count: 2,
  total_credit: 200000,
  remaining_balance: 200000,
  has_mora: true,
  customer_id: 'c1',
  customer: { name: 'José Peña', id_number: '1.061.111' },
  seller_id: 'v',
  created_by: 'v',
  gestor_cobro_id: 'yo',
  delivery_order_id: null,
  remission_id: null,
  source_delivery_order_id: null,
  delivery_order: null,
  remission: null,
  source_delivery_order: null,
  dias_atraso: 20,
  overdue_amount: 100000,
  next_due_date: '2026-09-05',
  next_due_amount: 100000,
  departamento_id: 'd1',
  departamento_name: 'Antioquia',
  municipio_id: 'm1',
  municipio_name: 'Álamo',
  vereda_id: 'v1',
  vereda_name: 'La Playa',
  address: 'Calle 1',
};
const page = { rows: [serverRow], summary: { totalCount: 1, totalSaldo: 200000, moraCount: 1 } };

const lastCall = () => mockPage.mock.calls[mockPage.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockRedirectHref = null;
  mockRoles = { admin: false, vendedor: false, gestor: true, soloBusqueda: false };
  mockPage.mockResolvedValue(page);
  (loadLocationMastersForList as jest.Mock).mockResolvedValue({ departamentos: [], municipios: [], veredas: [] });
});

describe('Negocios (lista unificada)', () => {
  it('el gestor abre en «Por cobrar», ve la tarjeta con ubicación y atraso, y el resumen', async () => {
    render(<NegociosScreen />);
    await waitFor(() => expect(mockPage).toHaveBeenCalled());
    expect(lastCall()).toMatchObject({ scope: 'por_cobrar', gestorId: null, search: '' });
    // Solo admin y recaudador ven «Todos»; el gestor puro solo tiene «Por cobrar» (sin pestañas).
    expect(screen.queryByText('Todos')).toBeNull();
    expect(screen.queryByText('Míos')).toBeNull();
    expect(await screen.findByText('Calle 1 · La Playa · Álamo')).toBeTruthy();
    expect(screen.getByText(/20 días de atraso/)).toBeTruthy();
    expect(screen.getByText('José Peña · CC 1.061.111')).toBeTruthy();
    expect(screen.getByLabelText(/1 negocios, saldo total .*200\.000, 1 en mora/)).toBeTruthy();
  });

  it('cambiar a «Todos» vuelve a consultar con ese alcance (admin)', async () => {
    mockRoles = { admin: true, vendedor: false, gestor: true, soloBusqueda: false };
    render(<NegociosScreen />);
    await waitFor(() => expect(mockPage).toHaveBeenCalled());
    fireEvent.press(screen.getByText('Todos'));
    await waitFor(() => expect(lastCall()).toMatchObject({ scope: 'todos' }));
  });

  it('el vendedor solo ve sus negocios («Míos», sin «Todos»); la ruta vieja abre «Míos»', async () => {
    mockRoles = { admin: false, vendedor: true, gestor: false, soloBusqueda: false };
    mockParams = { alcance: 'todos' };
    render(<NegociosScreen />);
    await waitFor(() => expect(lastCall()).toMatchObject({ scope: 'mios' }));
    expect(screen.queryByText('Todos')).toBeNull();
    expect(screen.queryByText('Por cobrar')).toBeNull();
  });

  it('vendedor y gestor a la vez ven «Míos» y «Por cobrar», no «Todos»', async () => {
    mockRoles = { admin: false, vendedor: true, gestor: true, soloBusqueda: false };
    render(<NegociosScreen />);
    await waitFor(() => expect(lastCall()).toMatchObject({ scope: 'por_cobrar' }));
    expect(screen.getByText('Míos')).toBeTruthy();
    expect(screen.getByText('Por cobrar')).toBeTruthy();
    expect(screen.queryByText('Todos')).toBeNull();
  });

  it('«Mis negocios» redirige a Negocios con alcance=mios', () => {
    render(<MisNegociosRedirect />);
    expect(mockRedirectHref).toEqual({ pathname: '/(tabs)/negocios', params: { alcance: 'mios' } });
  });

  it('el buscador consulta al servidor tras dejar de escribir', async () => {
    render(<NegociosScreen />);
    await waitFor(() => expect(mockPage).toHaveBeenCalled());
    fireEvent.changeText(screen.getByPlaceholderText('Buscar por cliente, cédula o número'), 'jose pena');
    await waitFor(() => expect(lastCall()).toMatchObject({ search: 'jose pena' }), { timeout: 2000 });
  });

  it('los filtros viajan al servidor, se cuentan y «Limpiar» los quita', async () => {
    render(<NegociosScreen />);
    await waitFor(() => expect(mockPage).toHaveBeenCalled());
    fireEvent.press(screen.getByLabelText('Filtros'));
    fireEvent.press(await screen.findByText('fake-aplicar-filtros'));
    await waitFor(() =>
      expect(lastCall().filters).toMatchObject({ departamentoId: 'd1', municipioId: 'm1', cobro: 'en_mora', order: 'saldo' })
    );
    expect(screen.getByText('Filtros (3)')).toBeTruthy();
    fireEvent.press(screen.getByText('Limpiar'));
    await waitFor(() =>
      expect(lastCall().filters).toMatchObject({ departamentoId: '', municipioId: '', cobro: 'todos', order: 'saldo' })
    );
    expect(screen.getByText('Filtros')).toBeTruthy();
  });

  it('el admin que no es gestor elige gestor antes de ver «Por cobrar»', async () => {
    mockRoles = { admin: true, vendedor: false, gestor: false, soloBusqueda: false };
    render(<NegociosScreen />);
    await waitFor(() => expect(lastCall()).toMatchObject({ scope: 'todos' }));
    mockPage.mockClear();
    fireEvent.press(screen.getByText('Por cobrar'));
    expect(await screen.findByText('Elige un gestor de cobro')).toBeTruthy();
    expect(mockPage).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Elegir gestor'));
    fireEvent.press(await screen.findByText('fake-elegir-gestor'));
    await waitFor(() => expect(lastCall()).toMatchObject({ scope: 'por_cobrar', gestorId: 'gestor-2' }));
    expect(screen.getByText('Gestor: Gestor Dos')).toBeTruthy();
  });

  it('el recaudador ve todos los negocios sin tener que buscar', async () => {
    mockRoles = { admin: false, vendedor: false, gestor: false, soloBusqueda: true };
    render(<NegociosScreen />);
    await waitFor(() => expect(lastCall()).toMatchObject({ scope: 'todos', search: '' }));
    expect(screen.queryByText('Busca el negocio que vas a cobrar')).toBeNull();
    expect(screen.queryByText('Por cobrar')).toBeNull();
  });

  it('sin señal usa el teléfono con los mismos filtros y lo avisa', async () => {
    mockPage.mockRejectedValue(new Error('Network request failed'));
    mockLocal.mockResolvedValue(page);
    render(<NegociosScreen />);
    await waitFor(() => expect(mockLocal).toHaveBeenCalled());
    expect(mockLocal.mock.calls[0][0]).toMatchObject({ scope: 'por_cobrar', userId: 'yo', gestorId: null });
    expect(await screen.findByText('Datos del teléfono')).toBeTruthy();
    expect(screen.getByText('Calle 1 · La Playa · Álamo')).toBeTruthy();
  });

  it('tocar la tarjeta abre el negocio para cobrar', async () => {
    render(<NegociosScreen />);
    const card = await screen.findByLabelText(/Negocio .*José Peña/);
    await act(async () => {
      fireEvent.press(card);
    });
    expect(mockPush).toHaveBeenCalledWith('/negocio/n1');
  });
});
