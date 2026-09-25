import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { isSelectiveSyncSupported } from '@/lib/offline/sync/syncPrefs';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { OfflineDataScreen } from '../OfflineDataScreen';
import { resetSyncPrefs } from '../infrastructure/syncPrefsService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(async () => undefined) }));
jest.mock('@/lib/offline/sync/syncPrefs', () => ({
  getLocalSyncConfig: jest.fn(async () => null),
  isSelectiveSyncSupported: jest.fn(async () => true),
}));
jest.mock('@/lib/offline/database', () => ({ isDatabaseOpen: jest.fn(() => true) }));
jest.mock('@/lib/offline/sync/downloadData', () => ({
  formatLastDownloadTime: jest.fn(() => '10:30 a. m.'),
  requestManualDownload: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/users/sellersService', () => ({ fetchSellerOptions: jest.fn(async () => []) }));
jest.mock('@/lib/locations/locationsService', () => ({
  EMPTY_LOCATION_MASTERS: { departamentos: [], municipios: [], veredas: [] },
  fetchLocationMasters: jest.fn(async () => ({ departamentos: [], municipios: [], veredas: [] })),
}));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
let mockRecaudador = false;
jest.mock('@/hooks/useUserRoles', () => ({
  useUserRoles: () => ({
    loading: false,
    isAdmin: () => false,
    isVendedor: () => true,
    isBodeguero: () => false,
    onlyFindsBySearch: () => mockRecaudador,
  }),
}));

const rpc = supabase.rpc as unknown as jest.Mock;
const mockedSupported = isSelectiveSyncSupported as jest.MockedFunction<typeof isSelectiveSyncSupported>;

const CONFIG = {
  clientes: { mode: 'todo', revision: 1, count: 4, ids: ['c1', 'c2', 'c3', 'c4'] },
  productos: { mode: 'seleccion', revision: 1, count: 1, ids: ['p1'] },
  ordenes: { revision: 1, count: 0, ids: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  mockRecaudador = false;
  mockedSupported.mockResolvedValue(true);
  useSyncStore.setState({ online: true, status: 'idle', lastSyncedAt: Date.now() });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  rpc.mockImplementation(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'get_mobile_sync_config') return { data: CONFIG, error: null };
    if (fn === 'list_mobile_sync_selection') {
      return args?.p_domain === 'productos'
        ? { data: [{ entity_id: 'p1', name: 'Silla comedor', sku: 'SIL-1' }], error: null }
        : { data: [], error: null };
    }
    if (fn === 'set_mobile_sync_mode') return { data: { domain: args?.p_domain, revision: 2 }, error: null };
    if (fn === 'set_mobile_sync_selection') return { data: { domain: args?.p_domain, count: 0, revision: 2 }, error: null };
    return { data: null, error: null };
  });
});

describe('OfflineDataScreen', () => {
  it('muestra las tarjetas de clientes, productos y órdenes con lo llevado', async () => {
    const screen = render(<OfflineDataScreen />);

    await screen.findByTestId('domain-card-clientes');
    expect(screen.getByTestId('domain-card-productos')).toBeTruthy();
    expect(screen.getByTestId('domain-card-ordenes')).toBeTruthy();
    expect(screen.getByText('1 llevado')).toBeTruthy();
    expect(screen.getByText('0 llevadas')).toBeTruthy();
    expect(screen.getByText('10:30 a. m.')).toBeTruthy();
    expect(await screen.findByText('Silla comedor')).toBeTruthy();
    expect(screen.getByText('Por categoría')).toBeTruthy();
    expect(screen.getByText('Descargar ahora')).toBeTruthy();
  });

  it('pide confirmación con el conteo antes de pasar a «Solo lo que elijo»', async () => {
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('domain-card-clientes');

    const clientesCard = screen.getByTestId('domain-card-clientes');
    const { getAllByText } = within(clientesCard);
    fireEvent.press(getAllByText('Solo lo que elijo')[0]);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Solo lo que elijo',
      expect.stringContaining('Hoy tienes 4 clientes marcados'),
      expect.any(Array)
    );
    expect(rpc).not.toHaveBeenCalledWith('set_mobile_sync_mode', expect.anything());

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === 'Cambiar')?.onPress?.();
    });

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_mobile_sync_mode', { p_domain: 'clientes', p_mode: 'seleccion' })
    );
    expect(await screen.findByText('4 llevados')).toBeTruthy();
  });

  it('quita un producto de la lista de llevados', async () => {
    const screen = render(<OfflineDataScreen />);
    await screen.findByText('Silla comedor');

    fireEvent.press(screen.getByLabelText('Quitar Silla comedor del teléfono'));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', {
        p_domain: 'productos',
        p_ids: ['p1'],
        p_selected: false,
      })
    );
  });

  it('oculta los ajustes si el servidor no admite la descarga selectiva', async () => {
    mockedSupported.mockResolvedValue(false);
    const screen = render(<OfflineDataScreen />);

    expect(await screen.findByText('Aún no disponible')).toBeTruthy();
    expect(screen.queryByTestId('domain-card-clientes')).toBeNull();
    expect(screen.getByText('Descargar ahora')).toBeTruthy();
  });

  it('el recaudador no tiene nada que elegir', async () => {
    mockRecaudador = true;
    const screen = render(<OfflineDataScreen />);
    expect(await screen.findByText('Tu teléfono lleva lo necesario para cobrar')).toBeTruthy();
    expect(screen.queryByTestId('domain-card-productos')).toBeNull();
  });
});
