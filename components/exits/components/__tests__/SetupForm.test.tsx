import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SetupForm } from '../SetupForm';

type MockCustomer = { id: string; name: string; id_number: string };

const mockSearchCustomers = jest.fn();

// Store real de zustand con solo lo que usa SetupForm: permite ver el re-render tras seleccionar.
jest.mock('@/components/exits/infrastructure/store/exitsStore', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  const useExitsStore = create<Record<string, unknown>>((set) => ({
    exitMode: 'direct_customer',
    selectedUserId: null,
    selectedCustomerId: null,
    selectedDeliveryOrderId: null,
    selectedDeliveryOrder: null,
    users: [],
    usersError: null,
    customers: [] as MockCustomer[],
    loading: false,
    customersLoading: false,
    loadUsers: jest.fn(async () => undefined),
    searchCustomers: (term: string) => mockSearchCustomers(term),
    setExitMode: jest.fn(),
    setSelectedUser: jest.fn(),
    setSelectedCustomer: (customerId: string | null) => set({ selectedCustomerId: customerId }),
    reset: jest.fn(),
    getSelectedDeliveryOrderProgress: () => null,
    canRegisterExit: true,
    authorizationMessage: null,
  }));
  return { useExitsStore };
});

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(effect, [effect]);
  },
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

jest.mock('@/components/inventory-flow', () => ({ FlowStepper: () => null }));

jest.mock('../DeliveryOrderSelector', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { DeliveryOrderSelector: () => ReactModule.createElement(Text, null, 'Seleccione la orden') };
});
jest.mock('../ExitModePickerField', () => ({ ExitModePickerField: () => null }));
jest.mock('../ExitOrderSummary', () => ({ ExitOrderSummary: () => null }));
jest.mock('../UserSelectField', () => ({ UserSelectField: () => null }));

const { useExitsStore } = jest.requireMock('@/components/exits/infrastructure/store/exitsStore') as {
  useExitsStore: { setState: (state: Record<string, unknown>) => void };
};

const CUSTOMERS: MockCustomer[] = [
  { id: 'c-1', name: 'EDGARDO MANUEL BARRAZA ACOSTA', id_number: '1001' },
  { id: 'c-2', name: 'EDGAR RUIZ', id_number: '1002' },
];

describe('SetupForm · entrega a cliente', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSearchCustomers.mockReset();
    useExitsStore.setState({ selectedCustomerId: null, customers: CUSTOMERS, customersLoading: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function searchFor(screen: ReturnType<typeof render>, term: string) {
    fireEvent.changeText(screen.getByLabelText('Buscar cliente'), term);
    act(() => {
      jest.advanceTimersByTime(800);
    });
  }

  it('cierra la lista de sugerencias al seleccionar un cliente y no la encima sobre la orden', () => {
    const screen = render(<SetupForm />);
    searchFor(screen, 'EDGA');

    expect(mockSearchCustomers).toHaveBeenCalledWith('EDGA');
    expect(screen.getByTestId('exit-customer-suggestions')).toBeTruthy();

    fireEvent.press(screen.getByText('EDGARDO MANUEL BARRAZA ACOSTA'));

    expect(screen.queryByTestId('exit-customer-suggestions')).toBeNull();
    expect(screen.queryByText('EDGAR RUIZ')).toBeNull();
    expect(screen.getByText('Cliente seleccionado: EDGARDO MANUEL BARRAZA ACOSTA')).toBeTruthy();
    expect(screen.getByText('Seleccione la orden')).toBeTruthy();
  });

  it('vuelve a mostrar las sugerencias si el usuario edita el nombre elegido', () => {
    const screen = render(<SetupForm />);
    searchFor(screen, 'EDGA');
    fireEvent.press(screen.getByText('EDGAR RUIZ'));
    expect(screen.queryByTestId('exit-customer-suggestions')).toBeNull();

    searchFor(screen, 'EDGAR RUI');

    expect(screen.getByTestId('exit-customer-suggestions')).toBeTruthy();
    expect(screen.queryByText(/Cliente seleccionado/)).toBeNull();
  });
});
