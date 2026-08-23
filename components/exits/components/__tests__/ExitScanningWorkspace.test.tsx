import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { ExitScanningWorkspace } from '../ExitScanningWorkspace';
import {
  useExitsStore,
  type DeliveryOrder,
  type ExitItem,
} from '../../infrastructure/store/exitsStore';

let mockIsDark = false;
const mockReplace = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: mockIsDark }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/components/scanning', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BarcodeScanner: ({ onScan }: { onScan: (barcode: string) => void }) => ReactModule.createElement(
      Pressable,
      { accessibilityRole: 'button', onPress: () => void onScan('770123') },
      ReactModule.createElement(Text, null, 'Emitir lectura'),
    ),
  };
});

const order: DeliveryOrder = {
  id: 'order-1',
  order_number: 'OE-101',
  customer_id: 'customer-1',
  customer_name: 'Cliente prueba',
  customer_id_number: '123',
  status: 'pending',
  delivery_address: 'Calle 1',
  notes: null,
  created_at: '2026-08-21T10:00:00.000Z',
  items: [{
    id: 'item-1',
    product_id: 'product-1',
    product_name: 'Silla comedor',
    product_barcode: '770123',
    product_sku: 'SIL-1',
    warehouse_id: 'warehouse-1',
    warehouse_name: 'Bodega principal',
    quantity: 4,
    delivered_quantity: 1,
    pending_quantity: 3,
    db_delivered_quantity: 1,
    created_at: '2026-08-21T10:00:00.000Z',
  }],
};

const product = {
  id: 'product-1',
  name: 'Silla comedor',
  sku: 'SIL-1',
  barcode: '770123',
} as ExitItem['product'];

const exitItem: ExitItem = {
  product,
  quantity: 2,
  barcode: '770123',
  availableStock: 1,
  warehouseId: 'warehouse-1',
};

const originalActions = {
  scanBarcode: useExitsStore.getState().scanBarcode,
  addProductToExit: useExitsStore.getState().addProductToExit,
  finalizeExit: useExitsStore.getState().finalizeExit,
};

describe('ExitScanningWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDark = false;
    useExitsStore.setState({
      step: 'scanning',
      selectedDeliveryOrderId: order.id,
      selectedDeliveryOrder: order,
      exitMode: 'direct_customer',
      selectedCustomerId: order.customer_id,
      canRegisterExit: true,
      deliveryObservations: '',
      registeredExitsCache: { [order.id]: { 'product-1-warehouse-1': 1 } },
      scannedItemsProgress: new Map(),
      exitItems: [],
      currentProduct: null,
      currentScannedBarcode: null,
      currentQuantity: 1,
      currentAvailableStock: 0,
      warehouseId: null,
      targetOrderItemId: null,
      loading: false,
      error: null,
      ...originalActions,
    });
  });

  afterEach(() => {
    cleanup();
    act(() => useExitsStore.setState(originalActions));
  });

  it('abre una ficha guiada tras el escaneo y agrega sin registrar la salida', async () => {
    const scanBarcode = jest.fn(async () => {
      useExitsStore.setState({
        currentProduct: product,
        currentScannedBarcode: '770123',
        currentQuantity: 1,
        currentAvailableStock: 3,
        warehouseId: 'warehouse-1',
        targetOrderItemId: 'item-1',
      });
    });
    const addProductToExit = jest.fn(async () => {
      useExitsStore.setState({
        exitItems: [{ ...exitItem, quantity: 1, availableStock: 2 }],
        scannedItemsProgress: new Map([['product-1-warehouse-1', 1]]),
        currentProduct: null,
        currentScannedBarcode: null,
      });
      return { ok: true as const, error: null };
    });
    const finalizeExit = jest.fn();
    useExitsStore.setState({ scanBarcode, addProductToExit, finalizeExit });

    const screen = render(<ExitScanningWorkspace />);
    fireEvent.press(screen.getByText('Escanear producto'));
    fireEvent.press(screen.getByText('Emitir lectura'));

    await waitFor(() => expect(screen.getByText('Producto encontrado')).toBeTruthy());
    expect(screen.getByText('Bodega principal')).toBeTruthy();
    fireEvent.press(screen.getByText('Agregar y volver al resumen'));

    await waitFor(() => expect(screen.getByText('Revisar salida')).toBeTruthy());
    expect(addProductToExit).toHaveBeenCalledWith(product, 1, '770123');
    expect(finalizeExit).not.toHaveBeenCalled();
  });

  it('conserva productos ante la revisión y muestra el éxito solo después de confirmar', async () => {
    const finalizeExit = jest.fn(async () => ({
      ok: true as const,
      error: null,
      summary: {
        orderNumber: 'OE-101',
        recipientName: 'Cliente prueba',
        productCount: 1,
        totalUnits: 2,
        orderCompleted: false,
      },
    }));
    useExitsStore.setState({
      exitItems: [exitItem],
      scannedItemsProgress: new Map([['product-1-warehouse-1', 2]]),
      finalizeExit,
    });

    const screen = render(<ExitScanningWorkspace />);
    fireEvent.press(screen.getByText('Revisar salida'));

    expect(screen.getByText('Esta salida dejará cantidades pendientes')).toBeTruthy();
    expect(screen.getByText(/Bodega principal/)).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Observación opcional'), 'Entregar en portería');
    fireEvent.press(screen.getByText('Registrar salida · 2 unidades'));

    await waitFor(() => expect(screen.getByText('Salida registrada correctamente')).toBeTruthy());
    expect(finalizeExit).toHaveBeenCalledWith('user-1');
    expect(useExitsStore.getState().exitItems).toHaveLength(1);
    expect(screen.getByText('Volver a Mis órdenes')).toBeTruthy();
    expect(screen.getByText('Registrar otra salida')).toBeTruthy();
  });

  it('renderiza el espacio operativo con el tema oscuro', () => {
    mockIsDark = true;
    const screen = render(<ExitScanningWorkspace />);

    expect(screen.getByText('Orden #OE-101')).toBeTruthy();
    expect(screen.getByText('Aún no has agregado productos')).toBeTruthy();
  });

  it('permite abrir directamente el listado real de productos pendientes', () => {
    const screen = render(<ExitScanningWorkspace />);

    fireEvent.press(screen.getByText('Ver pendientes (1)'));

    expect(screen.getByText('Silla comedor')).toBeTruthy();
    expect(screen.getByText('Bodega principal · Pendiente 3')).toBeTruthy();
    fireEvent.press(screen.getByText('Silla comedor'));
    expect(screen.getAllByText('Esta salida')).toHaveLength(2);
    expect(screen.getByText('Entregado')).toBeTruthy();
  });
});
