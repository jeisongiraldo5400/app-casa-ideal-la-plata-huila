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
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BarcodeScanner: ({ onScan, active = true }: { onScan: (value: string) => void; active?: boolean }) =>
      ReactModule.createElement(
        View,
        { testID: 'barcode-scanner' },
        active
          ? ReactModule.createElement(Pressable, { onPress: () => void onScan('770123') }, ReactModule.createElement(Text, null, 'Emitir lectura'))
          : ReactModule.createElement(Text, null, 'Scanner oculto'),
      ),
  };
});

const product = { id: 'product-1', name: 'Mesa auxiliar', sku: 'MES-1', barcode: '770123' } as EntryItem['product'];
const productTwo = { id: 'product-2', name: 'Silla plegable', sku: 'SIL-2', barcode: '770456' } as EntryItem['product'];
const item: EntryItem = { product, quantity: 2, barcode: '770123' };
const itemTwo: EntryItem = { product: productTwo, quantity: 1, barcode: '770456' };
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
    expect(screen.queryByTestId('barcode-scanner')).toBeNull();
    expect(addProductToEntry).toHaveBeenCalledWith(product, 1, '770123');
    expect(finalizeEntry).not.toHaveBeenCalled();
  });

  it('keeps the scanner mounted after a scan and shows it again immediately after adding the next product', async () => {
    const scanBarcode = jest.fn(async () => {
      expect(screen.queryByText('Emitir lectura')).toBeNull();
      expect(screen.getByTestId('barcode-scanner')).toBeTruthy();
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
    expect(screen.getByTestId('barcode-scanner')).toBeTruthy();
    expect(screen.getByText('Scanner oculto')).toBeTruthy();

    fireEvent.press(screen.getByText('Agregar y escanear siguiente'));
    await waitFor(() => expect(screen.getByText('Emitir lectura')).toBeTruthy());
    expect(addProductToEntry).toHaveBeenCalledWith(product, 1, '770123');
  });

  it('unmounts the scanner when reviewing the entry and keeps it unmounted after returning to edit', async () => {
    const scanBarcode = jest.fn(async () => {
      const found = scanBarcode.mock.calls.length > 1 ? productTwo : product;
      useEntriesStore.setState({
        currentProduct: found,
        currentScannedBarcode: found.barcode,
        currentQuantity: 1,
        uiStage: 'product_review',
      });
      return { status: 'found' as const, product: found, error: null };
    });
    const addProductToEntry = jest.fn(async () => {
      const next = addProductToEntry.mock.calls.length > 1 ? [{ ...item, quantity: 1 }, itemTwo] : [{ ...item, quantity: 1 }];
      useEntriesStore.setState({
        entryItems: next,
        currentProduct: null,
        currentScannedBarcode: null,
        uiStage: 'idle',
      });
      return { ok: true as const, error: null };
    });
    useEntriesStore.setState({ scanBarcode, addProductToEntry });

    const screen = render(<EntryScanningWorkspace />);
    fireEvent.press(screen.getByText('Escanear producto'));
    fireEvent.press(screen.getByText('Emitir lectura'));
    await waitFor(() => expect(screen.getByText('Verificar producto')).toBeTruthy());
    fireEvent.press(screen.getByText('Agregar y volver al resumen'));
    await waitFor(() => expect(screen.getByText('Escanear otro')).toBeTruthy());

    fireEvent.press(screen.getByText('Escanear otro'));
    await waitFor(() => expect(screen.getByText('Emitir lectura')).toBeTruthy());
    fireEvent.press(screen.getByText('Emitir lectura'));
    await waitFor(() => expect(screen.getByText('Silla plegable')).toBeTruthy());
    fireEvent.press(screen.getByText('Agregar y volver al resumen'));
    await waitFor(() => expect(screen.getByText('Revisar entrada')).toBeTruthy());

    fireEvent.press(screen.getByText('Revisar entrada'));
    await waitFor(() => expect(screen.getByText('Seguir editando')).toBeTruthy());
    expect(screen.getByText('Mesa auxiliar')).toBeTruthy();
    expect(screen.getByText('Silla plegable')).toBeTruthy();
    // La cámara no debe quedar viva (ni siquiera oculta) detrás de la revisión.
    expect(screen.queryByTestId('barcode-scanner')).toBeNull();

    fireEvent.press(screen.getByText('Seguir editando'));
    await waitFor(() => expect(screen.getByText('Escanear otro')).toBeTruthy());
    expect(screen.getByText('Mesa auxiliar')).toBeTruthy();
    expect(screen.getByText('Silla plegable')).toBeTruthy();
    // Sigue sin montarse hasta que el usuario la reabra explícitamente.
    expect(screen.queryByTestId('barcode-scanner')).toBeNull();

    fireEvent.press(screen.getByText('Escanear otro'));
    expect(screen.getByTestId('barcode-scanner')).toBeTruthy();
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

  it('shows the scanner again after creating a product mid-session (product-form round trip)', async () => {
    const addProductToEntry = jest.fn(async () => {
      useEntriesStore.setState({ entryItems: [{ ...item, quantity: 1 }], currentProduct: null, currentScannedBarcode: null, uiStage: 'idle' });
      return { ok: true as const, error: null };
    });
    useEntriesStore.setState({ addProductToEntry });

    // app/(tabs)/entries.tsx desmonta EntryScanningWorkspace al pasar por step:'product-form'
    // (código de barras no registrado) y lo vuelve a montar cuando ProductForm.handleSubmit
    // hace setState({ step:'scanning', uiStage:'product_review' }) directamente, sin pasar por
    // openScanner(). El store queda así *antes* de que exista ninguna instancia de
    // EntryScanningWorkspace; el render de abajo es, por tanto, una instancia nueva con
    // estado local reiniciado (scannerMounted en false), igual que en la app real.
    useEntriesStore.setState({
      currentProduct: product,
      currentScannedBarcode: '770123',
      currentQuantity: 1,
      step: 'scanning',
      uiStage: 'product_review',
    });
    const screen = render(<EntryScanningWorkspace />);

    await waitFor(() => expect(screen.getByText('Verificar producto')).toBeTruthy());
    fireEvent.press(screen.getByText('Agregar y escanear siguiente'));
    await waitFor(() => expect(screen.getByTestId('barcode-scanner')).toBeTruthy());
    expect(screen.getByText('Emitir lectura')).toBeTruthy();
  });

  it('renders the operational workspace in dark mode', () => {
    mockIsDark = true;
    const screen = render(<EntryScanningWorkspace />);
    expect(screen.getByText('Entrada manual')).toBeTruthy();
    expect(screen.getByText('Aún no has agregado productos')).toBeTruthy();
  });
});
