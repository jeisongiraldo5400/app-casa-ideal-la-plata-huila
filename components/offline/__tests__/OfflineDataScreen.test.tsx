import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { runSync } from '@/lib/offline/sync/syncEngine';
import { requestManualDownload } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { OfflineDataScreen } from '../OfflineDataScreen';
import { resetSyncPrefs } from '../infrastructure/syncPrefsService';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(async () => undefined) }));
jest.mock('@/lib/offline/sync/syncPrefs', () => ({
  getLocalSyncConfig: jest.fn(async () => null),
  isSelectiveSyncSupported: jest.fn(async () => false),
  lastManualDownloadAt: jest.fn(async () => null),
  markChoicesChangedLocally: jest.fn(async () => undefined),
  hasPendingChoicesToDownload: jest.fn(async () => false),
}));
jest.mock('@/lib/offline/database', () => ({ isDatabaseOpen: jest.fn(() => true) }));
jest.mock('@/lib/offline/repositories/catalogRepository', () => ({ localCatalogPulledAt: jest.fn(async () => null) }));
jest.mock('@/lib/offline/sync/downloadData', () => ({
  formatLastDownloadTime: jest.fn((at: number | null) => (at ? '10:30 a. m.' : null)),
  requestManualDownload: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/locations/locationsService', () => ({
  EMPTY_LOCATION_MASTERS: { departamentos: [], municipios: [], veredas: [] },
  fetchLocationMasters: jest.fn(async () => ({
    departamentos: [{ id: 'd1', nombre: 'Antioquia' }],
    municipios: [{ id: 'm1', nombre: 'Rionegro', departamento_id: 'd1' }],
    veredas: [],
  })),
}));
jest.mock('@/components/customers/infrastructure/services/customersDirectoryService', () => ({
  fetchCustomersPage: jest.fn(async () => ({ customers: [], totalCount: 0, hasMore: false, fromCache: false })),
}));
jest.mock('../infrastructure/bulkSelectionService', () => ({
  estimateSelection: jest.fn(async () => ({ clientes: 120, negocios: 15, approximate: false })),
  fetchCustomerCandidates: jest.fn(async () => ({ ids: [], total: 0 })),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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

let config: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  mockRecaudador = false;
  config = {
    clientes: { mode: 'todo', revision: 1, count: 4, ids: ['c1', 'c2', 'c3', 'c4'] },
    productos: { mode: 'todo', revision: 1, count: 0, ids: [] },
    ordenes: { revision: 1, count: 1, ids: ['o1'] },
    municipios: { revision: 1, count: 0, ids: [] },
  };
  useSyncStore.setState({ online: true, status: 'idle', lastSyncedAt: Date.now(), userId: 'u1' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  rpc.mockImplementation(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'get_mobile_sync_config') return { data: config, error: null };
    if (fn === 'list_mobile_sync_selection') {
      return args?.p_domain === 'ordenes'
        ? { data: [{ entity_id: 'o1', name: 'OE-000123', detail: 'customer · approved' }], error: null }
        : { data: [{ entity_id: 'c1', name: 'Ana Pérez', detail: '111' }], error: null };
    }
    if (fn === 'set_mobile_sync_mode') return { data: { domain: args?.p_domain, revision: 2 }, error: null };
    if (fn === 'set_mobile_sync_selection') {
      return { data: { domain: args?.p_domain, count: args?.p_selected ? 1 : 0, revision: 2 }, error: null };
    }
    return { data: null, error: null };
  });
});

describe('OfflineDataScreen · Preparar el teléfono', () => {
  it('muestra los bloques: siempre incluido, clientes, productos y órdenes', async () => {
    const screen = render(<OfflineDataScreen />);

    await screen.findByTestId('domain-card-clientes');
    expect(screen.getByText('Siempre incluido')).toBeTruthy();
    expect(screen.getByTestId('domain-card-productos')).toBeTruthy();
    expect(screen.getByTestId('products-switch').props.value).toBe(true);
    expect(screen.getByTestId('domain-card-ordenes')).toBeTruthy();
    expect(screen.getByText('1 llevada')).toBeTruthy();
    expect(await screen.findByText('OE-000123')).toBeTruthy();
    expect(screen.getByText('Descargar')).toBeTruthy();
    // Ya no hay selección por producto, categoría ni bodega.
    expect(screen.queryByText('Por categoría')).toBeNull();
    expect(screen.queryByText('Por bodega')).toBeNull();
  });

  it('pide confirmación con el conteo antes de pasar a «Elegir» y no descarga sola', async () => {
    const screen = render(<OfflineDataScreen />);
    const card = await screen.findByTestId('domain-card-clientes');

    fireEvent.press(within(card).getByText('Elegir'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Elegir clientes',
      expect.stringContaining('Hoy tienes 4 clientes elegidos y 0 municipios'),
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
    expect(await screen.findByTestId('municipios-picker')).toBeTruthy();
    expect(await screen.findByText('Pendiente de descargar')).toBeTruthy();
    expect(screen.getByTestId('prepare-warning')).toBeTruthy();
    expect(await screen.findByTestId('selection-estimate')).toHaveTextContent(/120 clientes · 15 negocios/);
    expect(runSync).not.toHaveBeenCalled();
  });

  it('en «Elegir» marca municipios y quita clientes de la lista', async () => {
    config.clientes = { mode: 'seleccion', revision: 1, count: 1, ids: ['c1'] };
    const screen = render(<OfflineDataScreen />);
    await screen.findByText('Ana Pérez');

    fireEvent.press(screen.getByLabelText('Quitar Ana Pérez del teléfono'));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', { p_domain: 'clientes', p_ids: ['c1'], p_selected: false })
    );

    fireEvent.press(await screen.findByText('Elige un departamento'));
    fireEvent.press(await screen.findByText('Antioquia'));
    await act(async () => {
      fireEvent.press(await screen.findByText('Rionegro'));
    });
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', { p_domain: 'municipios', p_ids: ['m1'], p_selected: true })
    );
    expect(await screen.findByLabelText('Quitar municipio Rionegro')).toBeTruthy();
  });

  it('el interruptor de productos pasa a «ninguno»', async () => {
    const screen = render(<OfflineDataScreen />);
    const toggle = await screen.findByTestId('products-switch');

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_mode', { p_domain: 'productos', p_mode: 'ninguno' });
  });

  it('«Descargar» lanza la descarga manual', async () => {
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('domain-card-clientes');
    await act(async () => {
      fireEvent.press(screen.getByText('Descargar'));
    });
    expect(requestManualDownload).toHaveBeenCalledTimes(1);
  });

  it('primer inicio de sesión: invita a preparar el teléfono', async () => {
    useSyncStore.setState({ lastSyncedAt: null });
    const screen = render(<OfflineDataScreen />);
    expect(await screen.findByTestId('prepare-first-time')).toBeTruthy();
  });

  it('oculta los ajustes si el servidor no tiene los RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const screen = render(<OfflineDataScreen />);

    expect(await screen.findByText('Aún no disponible')).toBeTruthy();
    expect(screen.queryByTestId('domain-card-clientes')).toBeNull();
    expect(screen.getByText('Descargar')).toBeTruthy();
  });

  it('el recaudador elige clientes, pero no ve productos ni órdenes', async () => {
    mockRecaudador = true;
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('domain-card-clientes');
    expect(screen.queryByTestId('domain-card-productos')).toBeNull();
    expect(screen.queryByTestId('domain-card-ordenes')).toBeNull();
  });
});
