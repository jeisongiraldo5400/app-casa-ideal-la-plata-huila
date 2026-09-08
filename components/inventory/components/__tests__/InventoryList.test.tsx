import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { InventoryList } from '../InventoryList';

const mockUseInventory = jest.fn();

jest.mock('@/components/inventory/infrastructure/hooks/useInventory', () => ({
  useInventory: () => mockUseInventory(),
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
    return ReactModule.createElement(NativeView, null, children);
  },
}));

const product = {
  id: 'product-1',
  name: 'Silla comedor',
  sku: 'SIL-1',
  barcode: '770123',
  brand_name: 'Casa Ideal',
  category_name: 'Comedor',
  color_name: null,
  total_stock: 4,
  stock_by_warehouse: {
    'warehouse-1': {
      warehouse_id: 'warehouse-1',
      warehouse_name: 'Principal',
      quantity: 4,
    },
  },
  status: true,
  created_at: '2026-08-23T10:00:00.000Z',
};

function inventoryState(overrides: Record<string, unknown> = {}) {
  return {
    inventory: [product],
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    searchQuery: '',
    selectedWarehouseId: null,
    totalCount: 40,
    hasMore: true,
    loadNextPage: jest.fn(async () => undefined),
    loadInventory: jest.fn(async () => undefined),
    refreshInventory: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('InventoryList progressive loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('carga la siguiente página al llegar al final sin mostrar un botón de carga', () => {
    const state = inventoryState();
    mockUseInventory.mockReturnValue(state);
    const screen = render(<InventoryList header={<Text>Inventario</Text>} />);

    fireEvent(screen.getByTestId('inventory-list'), 'endReached');

    expect(state.loadNextPage).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Cargar más productos')).toBeNull();
    expect(screen.queryByText('Buscar en más productos')).toBeNull();
  });

  it('muestra el indicador inferior mientras agrega otra página', () => {
    mockUseInventory.mockReturnValue(inventoryState({ loadingMore: true }));
    const screen = render(<InventoryList header={<Text>Inventario</Text>} />);

    expect(screen.getByText('Cargando más productos...')).toBeTruthy();
  });

  it('refresca desde la primera página mediante pull-to-refresh', () => {
    const state = inventoryState();
    mockUseInventory.mockReturnValue(state);
    const screen = render(<InventoryList header={<Text>Inventario</Text>} />);

    fireEvent(screen.getByTestId('inventory-list'), 'refresh');

    expect(state.refreshInventory).toHaveBeenCalledTimes(1);
  });

  it('espera 300 ms antes de consultar una búsqueda nueva', () => {
    jest.useFakeTimers();
    const loadInventory = jest.fn(async () => undefined);
    mockUseInventory.mockReturnValue(inventoryState({ loadInventory, searchQuery: '' }));
    const screen = render(<InventoryList header={<Text>Inventario</Text>} />);
    expect(loadInventory).toHaveBeenCalledTimes(1);

    mockUseInventory.mockReturnValue(inventoryState({ loadInventory, searchQuery: 'silla' }));
    screen.rerender(<InventoryList header={<Text>Inventario</Text>} />);

    act(() => jest.advanceTimersByTime(299));
    expect(loadInventory).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    expect(loadInventory).toHaveBeenCalledTimes(2);
  });
});
