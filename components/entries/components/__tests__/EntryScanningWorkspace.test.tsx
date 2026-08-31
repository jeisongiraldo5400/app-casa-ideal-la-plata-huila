import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { EntryScanningWorkspace } from '../EntryScanningWorkspace';
import { type EntryItem, useEntriesStore } from '../../infrastructure/store/entriesStore';

let mockIsDark = false;
const mockReplace = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: mockIsDark }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-haptics', () => ({ NotificationFeedbackType: { Success: 'success', Error: 'error' }, ImpactFeedbackStyle: { Light: 'light' }, notificationAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/components/scanning', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { BarcodeScanner: ({ onScan }: { onScan: (value: string) => void }) => ReactModule.createElement(Pressable, { onPress: () => void onScan('770123') }, ReactModule.createElement(Text, null, 'Emitir lectura')) };
});

const product = { id: 'product-1', name: 'Mesa auxiliar', sku: 'MES-1', barcode: '770123' } as EntryItem['product'];
const item: EntryItem = { product, quantity: 2, barcode: '770123' };
const originalActions = {
  scanBarcode: useEntriesStore.getState().scanBarcode,
  addProductToEntry: useEntriesStore.getState().addProductToEntry,
  finalizeEntry: useEntriesStore.getState().finalizeEntry,
};

describe('EntryScanningWorkspace', () => {
  beforeEach(() => {
    mockIsDark = false;
    jest.clearAllMocks();
    useEntriesStore.setState({
      entryType: 'ENTRY', step: 'scanning', uiStage: 'idle', warehouseId: 'warehouse-1',
      warehouses: [{ id: 'warehouse-1', name: 'Bodega principal' } as any], suppliers: [],
      purchaseOrderId: null, selectedPurchaseOrder: null, entryItems: [], scannedItemsProgress: new Map(),
      currentProduct: null, currentScannedBarcode: null, currentQuantity: 1, loading: false, error: null,
      ...originalActions,
    });
  });

  afterEach(() => { cleanup(); act(() => useEntriesStore.setState(originalActions)); });

  it('shows product verification after scanning and does not finalize automatically', async () => {
    const scanBarcode = jest.fn(async () => {
      useEntriesStore.setState({ currentProduct: product, currentScannedBarcode: '770123', currentQuantity: 1, uiStage: 'product_review' });
      return { status: 'found' as const, product, error: null };
    });
    const addProductToEntry = jest.fn(async () => {
      useEntriesStore.setState({ entryItems: [{ ...item, quantity: 1 }], currentProduct: null, currentScannedBarcode: null, uiStage: 'idle' });
      return { ok: true as const, error: null };
    });
    const finalizeEntry = jest.fn();
    useEntriesStore.setState({ scanBarcode, addProductToEntry, finalizeEntry });

    const screen = render(<EntryScanningWorkspace />);
    fireEvent.press(screen.getByText('Escanear producto'));
    fireEvent.press(screen.getByText('Emitir lectura'));
    await waitFor(() => expect(screen.getByText('Verificar producto')).toBeTruthy());
    expect(screen.getByText('Bodega principal')).toBeTruthy();

    fireEvent.press(screen.getByText('Agregar y volver al resumen'));
    await waitFor(() => expect(screen.getByText('Revisar entrada')).toBeTruthy());
    expect(addProductToEntry).toHaveBeenCalledWith(product, 1, '770123');
    expect(finalizeEntry).not.toHaveBeenCalled();
  });

  it('closes the scanner before looking up a barcode and reopens it after adding the next product', async () => {
    const scanBarcode = jest.fn(async () => {
      expect(screen.queryByText('Emitir lectura')).toBeNull();
      useEntriesStore.setState({ currentProduct: product, currentScannedBarcode: '770123', currentQuantity: 1, uiStage: 'product_review' });
      return { status: 'found' as const, product, error: null };
    });
    const addProductToEntry = jest.fn(async () => {
      useEntriesStore.setState({ entryItems: [{ ...item, quantity: 1 }], currentProduct: null, currentScannedBarcode: null, uiStage: 'idle' });
      return { ok: true as const, error: null };
    });
    useEntriesStore.setState({ scanBarcode, addProductToEntry });

    const screen = render(<EntryScanningWorkspace />);
    fireEvent.press(screen.getByText('Escanear producto'));
    expect(screen.getByText('Emitir lectura')).toBeTruthy();
    fireEvent.press(screen.getByText('Emitir lectura'));
    await waitFor(() => expect(screen.getByText('Verificar producto')).toBeTruthy());
    expect(scanBarcode).toHaveBeenCalledWith('770123');

    fireEvent.press(screen.getByText('Agregar y escanear siguiente'));
    expect(screen.queryByText('Emitir lectura')).toBeNull();
    await waitFor(() => expect(screen.getByText('Emitir lectura')).toBeTruthy(), { timeout: 1000 });
    expect(addProductToEntry).toHaveBeenCalledWith(product, 1, '770123');
  });

  it('keeps products until final success and offers the agreed destinations', async () => {
    const finalizeEntry = jest.fn(async () => ({ ok: true as const, error: null, summary: { entryType: 'ENTRY' as const, orderNumber: null, productCount: 1, totalUnits: 2, orderCompleted: false } }));
    useEntriesStore.setState({ entryItems: [item], finalizeEntry });
    const screen = render(<EntryScanningWorkspace />);

    fireEvent.press(screen.getByText('Revisar entrada'));
    fireEvent.press(screen.getByText('Registrar entrada · 2 unidades'));

    await waitFor(() => expect(screen.getByText('Entrada registrada correctamente')).toBeTruthy());
    expect(useEntriesStore.getState().entryItems).toHaveLength(1);
    expect(screen.getByText('Ver inventario')).toBeTruthy();
    expect(screen.getByText('Registrar otra entrada')).toBeTruthy();
  });

  it('renders the operational workspace in dark mode', () => {
    mockIsDark = true;
    const screen = render(<EntryScanningWorkspace />);
    expect(screen.getByText('Entrada manual')).toBeTruthy();
    expect(screen.getByText('Aún no has agregado productos')).toBeTruthy();
  });
});
