import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { ExitOrderSummary } from '../ExitOrderSummary';

const mockStartExit = jest.fn();
const mockChangeDeliveryOrder = jest.fn();
const mockSetDeliveryObservations = jest.fn();
let mockIsDark = false;
let mockObservation = '';

const mockState = {
  selectedDeliveryOrder: {
    id: 'order-1',
    order_number: 'OE-101',
    customer_name: 'Cliente prueba',
    assigned_to_user_name: null,
    status: 'pending',
    delivery_address: 'Calle 10 # 20-30',
    items: [{ id: 'item-1' }],
  },
  exitMode: 'direct_customer',
  get deliveryObservations() {
    return mockObservation;
  },
  setDeliveryObservations: mockSetDeliveryObservations,
  getSelectedDeliveryOrderProgress: () => ({
    items: [{ id: 'item-1' }],
    totalRequired: 5,
    totalRegistered: 2,
    totalScanned: 0,
    totalCompleted: 2,
  }),
  startExit: mockStartExit,
  changeDeliveryOrder: mockChangeDeliveryOrder,
  loading: false,
};

jest.mock('@/components/exits/infrastructure/store/exitsStore', () => ({
  useExitsStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: mockIsDark }),
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

describe('ExitOrderSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDark = false;
    mockObservation = '';
  });

  it('permite comenzar a escanear sin observaciones', () => {
    const screen = render(<ExitOrderSummary />);

    expect(screen.getByText('#OE-101')).toBeTruthy();
    expect(screen.getByText('1 producto · 3 unidades')).toBeTruthy();
    expect(screen.queryByLabelText('Observación de la entrega')).toBeNull();

    fireEvent.press(screen.getByText('Comenzar a escanear'));
    expect(mockStartExit).toHaveBeenCalledTimes(1);
  });

  it('despliega la observación únicamente cuando el usuario la solicita', () => {
    const screen = render(<ExitOrderSummary />);

    fireEvent.press(screen.getByText('Agregar observación'));
    const input = screen.getByLabelText('Observación de la entrega');
    fireEvent.changeText(input, 'Recibe portería');

    expect(mockSetDeliveryObservations).toHaveBeenCalledWith('Recibe portería');
  });

  it('conserva contraste en modo oscuro y permite cambiar de orden', () => {
    mockIsDark = true;
    mockObservation = 'Entrega parcial';
    const screen = render(<ExitOrderSummary />);

    expect(screen.getByText('Guardar observación y escanear')).toBeTruthy();
    fireEvent.press(screen.getByText('Cambiar orden'));
    expect(mockChangeDeliveryOrder).toHaveBeenCalledTimes(1);
  });
});
