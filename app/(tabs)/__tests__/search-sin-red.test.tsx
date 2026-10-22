import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import QuickSearchScreen from '../search';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import {
  findCatalogProductByBarcodeFromLocal,
  hasLocalCatalog,
} from '@/lib/offline/repositories/catalogRepository';

/**
 * «Buscar producto» sin señal: el código escaneado se busca en el catálogo
 * descargado. Antes siempre terminaba en «Sin conexión» aunque el producto
 * estuviera en el teléfono.
 */

const NETWORK_ERROR = { message: 'TypeError: Network request failed', details: '', hint: '', code: '' };

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      const builder: any = {};
      ['select', 'is', 'eq', 'order', 'limit'].forEach((method) => {
        builder[method] = jest.fn(() => builder);
      });
      // PostgREST no lanza: devuelve el fallo de red dentro de `error`.
      const failed = { data: null, error: NETWORK_ERROR };
      builder.maybeSingle = jest.fn(async () => failed);
      builder.single = jest.fn(async () => failed);
      return builder;
    }),
  },
}));

jest.mock('@/lib/offline/repositories/catalogRepository', () => ({
  hasLocalCatalog: jest.fn(async () => true),
  findCatalogProductByBarcodeFromLocal: jest.fn(async () => null),
}));

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

const mockSetSearchQuery = jest.fn();
jest.mock('@/components/inventory/infrastructure/store/inventoryStore', () => ({
  useInventoryStore: () => ({ setSearchQuery: mockSetSearchQuery }),
}));

jest.mock('@/components/scanning', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BarcodeScanner: ({ onScan }: { onScan: (code: string) => void }) =>
      ReactModule.createElement(Text, { onPress: () => onScan('770001') }, 'escanear'),
  };
});

jest.mock('@/components/ui/ScreenErrorBoundary', () => ({
  ScreenErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Buscar producto sin señal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    useSyncStore.setState({ online: true });
    (hasLocalCatalog as jest.Mock).mockResolvedValue(true);
    (findCatalogProductByBarcodeFromLocal as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => jest.restoreAllMocks());

  it('si la petición no llega y el producto está en el teléfono, abre el inventario', async () => {
    (findCatalogProductByBarcodeFromLocal as jest.Mock).mockResolvedValue({ id: 'p1', name: 'Nevera' });
    const screen = render(<QuickSearchScreen />);

    fireEvent.press(screen.getByText('escanear'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/inventory'));
    expect(mockSetSearchQuery).toHaveBeenCalledWith('770001');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('si no vino en la descarga, lo dice en vez de «Sin conexión»', async () => {
    useSyncStore.setState({ online: false });
    const screen = render(<QuickSearchScreen />);

    fireEvent.press(screen.getByText('escanear'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('No está en el teléfono');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('sin catálogo en el teléfono mantiene el aviso de sin conexión', async () => {
    (hasLocalCatalog as jest.Mock).mockResolvedValue(false);
    const screen = render(<QuickSearchScreen />);

    fireEvent.press(screen.getByText('escanear'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Sin conexión');
  });
});
