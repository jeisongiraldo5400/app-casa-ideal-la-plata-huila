import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { runSync } from '@/lib/offline/sync/syncEngine';
import { EMPTY_CARTERA } from '@/lib/customers/customerSummary';
import { loadSyncPrefs, resetSyncPrefs } from '@/components/offline/infrastructure/syncPrefsService';
import { CustomerDetailScreen } from '../CustomerDetailScreen';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/lib/offline/sync/syncEngine', () => ({ runSync: jest.fn(async () => undefined) }));
jest.mock('@/lib/offline/sync/syncPrefs', () => ({
  getLocalSyncConfig: jest.fn(async () => null),
  isSelectiveSyncSupported: jest.fn(async () => true),
  lastManualDownloadAt: jest.fn(async () => null),
  markChoicesChangedLocally: jest.fn(async () => undefined),
  hasPendingChoicesToDownload: jest.fn(async () => false),
}));
jest.mock('@/lib/offline/database', () => ({ isDatabaseOpen: jest.fn(() => true) }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const mockDetail = jest.fn();
jest.mock('../../infrastructure/hooks/useCustomerDetail', () => ({
  useCustomerDetail: () => mockDetail(),
}));

const rpc = supabase.rpc as unknown as jest.Mock;

function detailState(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    error: null,
    fromCache: false,
    canClaim: false,
    claimDisabled: false,
    claiming: false,
    claim: jest.fn(),
    reload: jest.fn(),
    summary: {
      customer: {
        id: 'c1',
        name: 'Ana Pérez',
        id_number: '111',
        phone: null,
        email: null,
        address: null,
        notes: null,
        municipio_name: null,
        vereda_name: null,
        departamento_name: null,
        created_at: null,
        seller_id: null,
      },
      seller: null,
      negocios: [],
      cartera: EMPTY_CARTERA,
      scope: { visible_negocios: 0, hidden_negocios: 0 },
    },
    ...overrides,
  };
}

function mockConfig(mode: 'todo' | 'seleccion', ids: string[]) {
  rpc.mockImplementation(async (fn: string, args?: { p_selected?: boolean }) => {
    if (fn === 'get_mobile_sync_config') {
      return {
        data: {
          clientes: { mode, revision: 1, count: ids.length, ids },
          productos: { mode: 'todo', revision: 1, count: 0, ids: [] },
          ordenes: { revision: 1, count: 0, ids: [] },
        },
        error: null,
      };
    }
    if (fn === 'set_mobile_sync_selection') {
      return { data: { domain: 'clientes', count: args?.p_selected ? 1 : 0, revision: 2 }, error: null };
    }
    return { data: null, error: null };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSyncPrefs();
  useSyncStore.setState({ online: true, lastSyncedAt: null });
  mockDetail.mockReturnValue(detailState());
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('Ficha de cliente · Llevar en el teléfono', () => {
  it('en «Elegir» ofrece llevarlo, lo marca en el servidor y queda pendiente de descargar', async () => {
    mockConfig('seleccion', []);
    const screen = render(<CustomerDetailScreen customerId="c1" />);
    await act(async () => {
      await loadSyncPrefs();
    });

    fireEvent.press(await screen.findByText('Llevar en el teléfono'));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_mobile_sync_selection', {
        p_domain: 'clientes',
        p_ids: ['c1'],
        p_selected: true,
      })
    );
    // Marcar no descarga (contrato v2): hasta pulsar «Descargar» queda pendiente.
    expect(await screen.findByText('Pendiente de descargar')).toBeTruthy();
    expect(screen.getByText('Quitar del teléfono')).toBeTruthy();
    expect(runSync).not.toHaveBeenCalled();
  });

  it('ya descargado muestra «En el teléfono»', async () => {
    mockConfig('seleccion', ['c1']);
    const screen = render(<CustomerDetailScreen customerId="c1" />);
    await act(async () => {
      await loadSyncPrefs();
    });
    expect(await screen.findByText('En el teléfono')).toBeTruthy();
  });

  it('en modo «Todos» no muestra el botón ni el chip', async () => {
    mockConfig('todo', ['c1']);
    const screen = render(<CustomerDetailScreen customerId="c1" />);
    await act(async () => {
      await loadSyncPrefs();
    });

    expect(screen.queryByText('Llevar en el teléfono')).toBeNull();
    expect(screen.queryByText('En el teléfono')).toBeNull();
  });

  it('sin señal y en selección, explica que el cliente no está en el teléfono', async () => {
    mockConfig('seleccion', []);
    mockDetail.mockReturnValue(detailState({ summary: null, error: 'Network request failed' }));
    const screen = render(<CustomerDetailScreen customerId="c9" />);
    await act(async () => {
      await loadSyncPrefs();
    });
    act(() => {
      useSyncStore.setState({ online: false });
    });

    expect(await screen.findByText('No está en el teléfono')).toBeTruthy();
    expect(screen.getByText('No está en el teléfono. Con señal, márcalo con «Llevar en el teléfono».')).toBeTruthy();
  });
});
