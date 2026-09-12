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
  const { Pressable, Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BarcodeScanner: ({ onScan, active = true }: { onScan: (barcode: string) => void; active?: boolean }) =>
      ReactModule.createElement(
        View,
        { testID: 'barcode-scanner' },
        active
          ? ReactModule.createElement(
            Pressable,
            { accessibilityRole: 'button', onPress: () => void onScan('770123') },
            ReactModule.createElement(Text, null, 'Emitir lectura'),
          )
          : ReactModule.createElement(Text, null, 'Scanner oculto'),
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
    source_delivery_order_id: null,
    group_key: 'own',
  }],
};

/** Remisión mixta: un producto propio y la copia de una OE de cliente anidada. */
const mixedRemission: DeliveryOrder = {
  ...order,
  id: 'remission-1',
  order_number: 'REM-7',
  order_type: 'remission',
  customer_name: '',
  assigned_to_user_name: 'Carlos Rutas',
  items: [
    { ...order.items[0], id: 'own-1' },
    {
      ...order.items[0],
      id: 'copy-1',
      product_id: 'product-2',
      product_name: 'Nevera 300L',
      product_barcode: '770999',
      product_sku: 'NEV-300',
      quantity: 2,
      delivered_quantity: 0,
      pending_quantity: 2,
      db_delivered_quantity: 0,
      source_delivery_order_id: 'child-1',
      source_order_number: 'OE-0012',
      source_customer_name: 'Cliente Norte',
      group_key: 'child-1',
    },
  ],
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
  addCurrentSerial: useExitsStore.getState().addCurrentSerial,
  selectScanWarehouse: useExitsStore.getState().selectScanWarehouse,
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
      currentSerials: [],
      serialChecking: false,
      currentGroupKey: null,
      warehouseCandidates: [],
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
        scannedItemsProgress: new Map([['product-1-warehouse-1::own', 1]]),
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
      scannedItemsProgress: new Map([['product-1-warehouse-1::own', 2]]),
      finalizeExit,
    });

    const screen = render(<ExitScanningWorkspace />);
    fireEvent.press(screen.getByText('Revisar salida'));

    expect(screen.getByText('Esta salida dejará cantidades pendientes')).toBeTruthy();
    expect(screen.getByText(/Bodega principal/)).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Observación opcional'), 'Entregar en portería');
    fireEvent.press(screen.getByText('Registrar salida · 2 unidades'));

    await waitFor(() => expect(screen.getByText('Salida registrada correctamente')).toBeTruthy());
    expect(finalizeExit).toHaveBeenCalledTimes(1);
    expect(useExitsStore.getState().exitItems).toHaveLength(1);
    expect(screen.getByText('Volver a Mis órdenes')).toBeTruthy();
    expect(screen.getByText('Registrar otra salida')).toBeTruthy();
  });

  it('captura un serial opcional en la ficha del producto', async () => {
    const addCurrentSerial = jest.fn(async () => {
      useExitsStore.setState({ currentSerials: [{ serial: 'AB123', normalized: 'AB123', method: 'manual' as const }] });
      return { ok: true as const, error: null };
    });
    useExitsStore.setState({
      currentProduct: product,
      currentScannedBarcode: '770123',
      currentQuantity: 1,
      currentAvailableStock: 3,
      currentPhysicalStock: 5,
      warehouseId: 'warehouse-1',
      targetOrderItemId: 'item-1',
      addCurrentSerial,
    });

    const screen = render(<ExitScanningWorkspace />);
    expect(screen.getByText('Seriales (opcional)')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Serial del aparato'), 'AB123');
    fireEvent.press(screen.getByText('Agregar'));

    await waitFor(() => expect(addCurrentSerial).toHaveBeenCalledWith('AB123', 'manual'));
    expect(await screen.findByText('AB123')).toBeTruthy();
    expect(screen.getByText('1 de 1')).toBeTruthy();
  });

  /** useNetworkStatus resuelve NetInfo.fetch() tras el montaje; se espera dentro de act. */
  async function renderSettled() {
    const screen = render(<ExitScanningWorkspace />);
    await act(async () => {});
    return screen;
  }

  it('renderiza el espacio operativo con el tema oscuro', async () => {
    mockIsDark = true;
    const screen = await renderSettled();

    expect(screen.getByText('Orden #OE-101')).toBeTruthy();
    expect(screen.getByText('Aún no has agregado productos')).toBeTruthy();
  });

  it('permite abrir directamente el listado real de productos pendientes', async () => {
    const screen = await renderSettled();

    fireEvent.press(screen.getByText('Ver pendientes (1)'));

    expect(screen.getByText('Silla comedor')).toBeTruthy();
    expect(screen.getByText('Bodega principal · Pendiente 3')).toBeTruthy();
    fireEvent.press(screen.getByText('Silla comedor'));
    expect(screen.getAllByText('Esta salida')).toHaveLength(2);
    expect(screen.getByText('Entregado')).toBeTruthy();
    expect(screen.queryByText('Productos de la orden')).toBeNull();
  });

  describe('remisión mixta (propios + OE de cliente)', () => {
    beforeEach(() => {
      useExitsStore.setState({
        selectedDeliveryOrderId: mixedRemission.id,
        selectedDeliveryOrder: mixedRemission,
        exitMode: 'direct_user',
        selectedUserId: 'user-2',
        selectedCustomerId: null,
        registeredExitsCache: { [mixedRemission.id]: { 'product-1-warehouse-1': 1 } },
      });
    });

    it('la lista de pendientes lleva un encabezado por grupo', async () => {
      const screen = await renderSettled();

      fireEvent.press(screen.getByText('Ver pendientes (2)'));

      expect(screen.getByText('Productos de la remisión')).toBeTruthy();
      expect(screen.getByText('OE-0012 · Cliente Norte')).toBeTruthy();
      expect(screen.getByText('Silla comedor')).toBeTruthy();
      expect(screen.getByText('Nevera 300L')).toBeTruthy();
    });

    it('la sesión agrupa los productos por su orden objetivo', async () => {
      useExitsStore.setState({
        exitItems: [
          { ...exitItem, product: { id: 'product-2', name: 'Nevera 300L', sku: 'NEV-300', barcode: '770999' } as ExitItem['product'], quantity: 1, groupKey: 'child-1', targetOrderId: 'child-1' },
          { ...exitItem, quantity: 1, groupKey: 'own', targetOrderId: 'remission-1' },
        ],
      });
      const screen = await renderSettled();

      expect(screen.getByText('Productos de la remisión')).toBeTruthy();
      expect(screen.getByText('OE-0012 · Cliente Norte')).toBeTruthy();
      expect(screen.getByText('Silla comedor')).toBeTruthy();
      expect(screen.getByText('Nevera 300L')).toBeTruthy();
    });

    it('con candidatas en dos grupos la ficha pide bodega y orden', async () => {
      useExitsStore.setState({
        currentProduct: product,
        currentScannedBarcode: '770123',
        warehouseId: null,
        currentGroupKey: null,
        warehouseCandidates: [
          { warehouseId: 'warehouse-1', warehouseName: 'Bodega principal', pending: 3, groupKey: 'own', groupLabel: 'Productos de la remisión', targetOrderId: 'remission-1' },
          { warehouseId: 'warehouse-1', warehouseName: 'Bodega principal', pending: 2, groupKey: 'child-1', groupLabel: 'OE-0012 · Cliente Norte', targetOrderId: 'child-1' },
        ],
      });
      const selectScanWarehouse = jest.fn(async () => undefined);
      useExitsStore.setState({ selectScanWarehouse });
      const screen = await renderSettled();

      expect(screen.getByText('¿De qué bodega y orden sale?')).toBeTruthy();
      fireEvent.press(screen.getByText('OE-0012 · Cliente Norte'));

      expect(selectScanWarehouse).toHaveBeenCalledWith('warehouse-1', 'child-1');
      act(() => useExitsStore.setState({ selectScanWarehouse: originalActions.selectScanWarehouse }));
    });
  });
});
