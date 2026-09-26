import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
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
    roles: mockRecaudador ? [{ role: { nombre: 'recaudador' } }] : [{ role: { nombre: 'vendedor' } }],
  }),
}));

const rpc = supabase.rpc as unknown as jest.Mock;

let config: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  mockRecaudador = false;
  config = {
    clientes: { mode: 'todo', revision: 1, count: 0, ids: [], mis_clientes: false },
    productos: { mode: 'todo', revision: 1 },
    ordenes: { revision: 1, count: 1, ids: ['o1'] },
    municipios: { revision: 1, count: 0, ids: [] },
    estimated: { clientes: 2123, negocios: 64 },
    orders_allowed: true,
    catalog_allowed: true,
  };
  useSyncStore.setState({ online: true, status: 'idle', lastSyncedAt: Date.now(), userId: 'u1' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  rpc.mockImplementation(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'get_mobile_sync_config') return { data: config, error: null };
    if (fn === 'list_mobile_sync_selection') {
      return { data: [{ entity_id: 'o1', name: 'OE-000123', detail: 'customer · approved' }], error: null };
    }
    if (fn === 'set_mobile_sync_mode') return { data: { domain: args?.p_domain, revision: 2 }, error: null };
    if (fn === 'set_mobile_sync_selection') {
      return { data: { domain: args?.p_domain, count: args?.p_selected ? 1 : 0, revision: 2 }, error: null };
    }
    return { data: null, error: null };
  });
});

describe('OfflineDataScreen · Preparar el teléfono (v3)', () => {
  it('muestra siempre incluido (clientes y negocios abiertos), productos, órdenes y la última descarga', async () => {
    const screen = render(<OfflineDataScreen />);

    await screen.findByTestId('domain-card-productos');
    expect(screen.getByText('Siempre incluido')).toBeTruthy();
    expect(screen.getByText(/Todos los clientes, con sus direcciones/)).toBeTruthy();
    expect(screen.getByText(/Negocios abiertos con sus cuotas y pagos \(los cerrados y anulados no se llevan\)/)).toBeTruthy();
    expect(screen.getByText(/Remisiones pendientes/)).toBeTruthy();
    expect(screen.getByTestId('prepare-estimate')).toHaveTextContent(
      'Se descargarán unos 2123 clientes y 64 negocios abiertos.'
    );
    expect(screen.getByTestId('products-switch').props.value).toBe(true);
    expect(screen.getByTestId('domain-card-ordenes')).toBeTruthy();
    expect(screen.getByText('1 llevada')).toBeTruthy();
    expect(await screen.findByText('OE-000123')).toBeTruthy();
    expect(screen.getByText('Última descarga')).toBeTruthy();
    expect(screen.getByText('Descargar')).toBeTruthy();
  });

  it('ya no hay bloque de clientes: ni «Elegir», ni municipios, ni «Mis clientes», ni el aviso de nada elegido', async () => {
    // Aunque el servidor todavía mande restos de v2, no se ofrecen.
    config.clientes = { mode: 'seleccion', revision: 1, count: 3, ids: ['c1'], mis_clientes: true };
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('domain-card-productos');

    expect(screen.queryByTestId('domain-card-clientes')).toBeNull();
    expect(screen.queryByText('Elegir')).toBeNull();
    expect(screen.queryByTestId('municipios-picker')).toBeNull();
    expect(screen.queryByTestId('mis-clientes-switch')).toBeNull();
    expect(screen.queryByTestId('clientes-nothing-chosen')).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith('list_mobile_sync_selection', expect.objectContaining({ p_domain: 'clientes' }));
  });

  it('quita una orden de la lista', async () => {
    const screen = render(<OfflineDataScreen />);
    fireEvent.press(await screen.findByLabelText('Quitar OE-000123 del teléfono'));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', { p_domain: 'ordenes', p_ids: ['o1'], p_selected: false })
    );
    expect(await screen.findByText('Pendiente de descargar')).toBeTruthy();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('sin catálogo ni órdenes permitidos por el servidor, oculta esos bloques', async () => {
    config.catalog_allowed = false;
    config.orders_allowed = false;
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('prepare-estimate');
    expect(screen.queryByTestId('domain-card-productos')).toBeNull();
    expect(screen.queryByTestId('domain-card-ordenes')).toBeNull();
  });

  it('el interruptor de productos pasa a «ninguno» sin descargar', async () => {
    const screen = render(<OfflineDataScreen />);
    const toggle = await screen.findByTestId('products-switch');

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    expect(rpc).toHaveBeenCalledWith('set_mobile_sync_mode', { p_domain: 'productos', p_mode: 'ninguno' });
    expect(await screen.findByText('Pendiente de descargar')).toBeTruthy();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('«Descargar» lanza la descarga manual sin preguntar', async () => {
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('domain-card-productos');
    await act(async () => {
      fireEvent.press(screen.getByText('Descargar'));
    });
    expect(Alert.alert).not.toHaveBeenCalled();
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
    expect(screen.queryByTestId('domain-card-productos')).toBeNull();
    expect(screen.getByText('Descargar')).toBeTruthy();
  });

  it('al recaudador: solo los clientes de los negocios que cobra, sin productos, órdenes ni remisiones', async () => {
    mockRecaudador = true;
    config.orders_allowed = false;
    config.catalog_allowed = false;
    const screen = render(<OfflineDataScreen />);
    await screen.findByTestId('prepare-estimate');
    expect(screen.getByText(/Los clientes de los negocios que cobras/)).toBeTruthy();
    expect(screen.queryByText(/Todos los clientes/)).toBeNull();
    expect(screen.queryByText(/Remisiones pendientes/)).toBeNull();
    expect(screen.queryByTestId('domain-card-productos')).toBeNull();
    expect(screen.queryByTestId('domain-card-ordenes')).toBeNull();
  });
});
