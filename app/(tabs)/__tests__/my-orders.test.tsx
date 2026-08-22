import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import MyOrdersScreen from '../my-orders';

const mockPush = jest.fn();
const mockRpc = jest.fn();
const mockSetExitMode = jest.fn();
const mockSetSelectedCustomer = jest.fn();
const mockSetSelectedUser = jest.fn();
const mockSelectDeliveryOrder = jest.fn();
const mockStartExit = jest.fn();
const mockUser = { id: 'operator-1' };

let mockExitState: {
  selectedDeliveryOrderId: string | null;
  canRegisterExit: boolean;
  authorizationMessage: string | null;
  error: string | null;
  step: 'setup' | 'scanning';
  setExitMode: typeof mockSetExitMode;
  setSelectedCustomer: typeof mockSetSelectedCustomer;
  setSelectedUser: typeof mockSetSelectedUser;
  selectDeliveryOrder: typeof mockSelectDeliveryOrder;
  startExit: typeof mockStartExit;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const mockReact = jest.requireActual<typeof import('react')>('react');
    mockReact.useEffect(callback, [callback]);
  },
}));

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/constants/theme', () => ({
  getColors: () => ({
    background: { default: '#fff', paper: '#fff' },
    text: { primary: '#111', secondary: '#666' },
    primary: { main: '#05f', contrastText: '#fff' },
    warning: { main: '#f90' },
    success: { main: '#090' },
    error: { main: '#d00' },
    divider: '#ddd',
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('@/components/exits/infrastructure/store/exitsStore', () => ({
  useExitsStore: { getState: () => mockExitState },
}));

const customerOrder = {
  id: 'order-1',
  order_number: 'ORD-001',
  order_type: 'customer',
  customer_id: 'customer-1',
  customer_name: 'Cliente prueba',
  customer_id_number: '123',
  assigned_to_user_id: null,
  status: 'pending',
  notes: null,
  delivery_address: 'Calle 1',
  created_at: '2026-08-21T10:00:00.000Z',
  total_items: 1,
  total_quantity: 3,
  delivered_quantity: 1,
  pending_quantity: 2,
};

const registeredOrder = {
  id: 'history-order-1',
  order_number: 'OE-HIST-1',
  order_type: 'customer',
  status: 'delivered',
  customer_id: 'customer-1',
  customer_name: 'Cliente prueba',
  customer_id_number: '123',
  recipient_name: 'Cliente prueba',
  recipient_type: 'customer',
  delivery_address: 'Calle 1',
  created_at: '2026-08-20T10:00:00.000Z',
  last_exit_at: '2026-08-21T10:00:00.000Z',
  total_items: 1,
  total_quantity: 3,
  delivered_quantity: 3,
  pending_quantity: 0,
  my_active_exit_count: 1,
  my_cancelled_exit_count: 1,
  my_active_quantity: 3,
  my_cancelled_quantity: 1,
  total_count: 1,
};

const registeredItem = {
  exit_id: 'exit-1',
  product_id: 'product-1',
  product_name: 'Colchón prueba',
  product_sku: 'COL-1',
  product_barcode: '123',
  warehouse_id: 'warehouse-1',
  warehouse_name: 'Principal',
  quantity: 3,
  created_at: '2026-08-21T10:00:00.000Z',
  delivery_observations: null,
  is_cancelled: true,
  cancellation_observations: 'Registro duplicado',
};

describe('MyOrdersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockExitState = {
      selectedDeliveryOrderId: null,
      canRegisterExit: true,
      authorizationMessage: null,
      error: null,
      step: 'setup',
      setExitMode: mockSetExitMode,
      setSelectedCustomer: mockSetSelectedCustomer,
      setSelectedUser: mockSetSelectedUser,
      selectDeliveryOrder: mockSelectDeliveryOrder,
      startExit: mockStartExit,
    };

    mockRpc.mockImplementation((functionName: string) => {
      if (functionName === 'get_my_authorized_delivery_orders') {
        return Promise.resolve({ data: [customerOrder], error: null });
      }
      if (functionName === 'get_my_registered_delivery_orders') {
        return Promise.resolve({ data: [registeredOrder], error: null });
      }
      if (functionName === 'get_my_registered_delivery_order_items') {
        return Promise.resolve({ data: [registeredItem], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
    mockSelectDeliveryOrder.mockImplementation(async (orderId: string) => {
      mockExitState.selectedDeliveryOrderId = orderId;
    });
    mockStartExit.mockImplementation(() => {
      mockExitState.step = 'scanning';
    });
  });

  it('abre directamente la salida al pulsar cualquier parte de la orden asignada', async () => {
    const screen = render(<MyOrdersScreen />);
    const orderCard = await screen.findByTestId('assigned-order-order-1');

    fireEvent.press(orderCard);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(tabs)/exits'));
    expect(mockSetExitMode).toHaveBeenCalledWith('direct_customer');
    expect(mockSetSelectedCustomer).toHaveBeenCalledWith('customer-1');
    expect(mockSelectDeliveryOrder).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ id: 'order-1', customer_id: 'customer-1' }),
    );
    expect(mockStartExit).toHaveBeenCalledTimes(1);
  });

  it('ignora un segundo toque mientras prepara la salida', async () => {
    let finishSelection: (() => void) | undefined;
    mockSelectDeliveryOrder.mockImplementation(
      () => new Promise<void>((resolve) => { finishSelection = resolve; }),
    );

    const screen = render(<MyOrdersScreen />);
    const orderCard = await screen.findByTestId('assigned-order-order-1');

    fireEvent.press(orderCard);
    fireEvent.press(orderCard);

    expect(mockSelectDeliveryOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockExitState.selectedDeliveryOrderId = 'order-1';
      finishSelection?.();
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });

  it('muestra el historial dentro de Mis órdenes y carga los productos del usuario', async () => {
    const screen = render(<MyOrdersScreen />);
    await screen.findByTestId('assigned-order-order-1');

    fireEvent.press(screen.getByText('Registradas por mí'));
    const historyCard = await screen.findByTestId('registered-order-history-order-1');
    expect(screen.getByText('Registrado por ti')).toBeTruthy();
    expect(screen.getByText('1 cancelado')).toBeTruthy();

    fireEvent.press(historyCard);

    await screen.findByText('Colchón prueba');
    expect(screen.getByText('Cancelada: Registro duplicado')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('get_my_registered_delivery_order_items', {
      p_order_id: 'history-order-1',
    });
  });
});
