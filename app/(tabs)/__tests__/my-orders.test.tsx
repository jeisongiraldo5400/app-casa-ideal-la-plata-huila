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

    mockRpc.mockResolvedValue({ data: [customerOrder], error: null });
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
});
