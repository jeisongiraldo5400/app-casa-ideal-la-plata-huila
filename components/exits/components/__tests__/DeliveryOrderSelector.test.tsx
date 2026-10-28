import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { DeliveryOrderSelector, deliveryOrderLabel } from '../DeliveryOrderSelector';

let mockState: Record<string, unknown> = {};

jest.mock('@/components/exits/infrastructure/store/exitsStore', () => {
  const useExitsStore = (selector: (state: Record<string, unknown>) => unknown) => selector(mockState);
  useExitsStore.getState = () => mockState;
  return { useExitsStore };
});
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});

const order = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  order_number: `OE-2026-${id}`,
  customer_id: 'c1',
  customer_name: 'Ana Gómez',
  customer_id_number: '123',
  status: 'pending',
  delivery_address: 'Calle 1 # 2-3',
  notes: null,
  created_at: '2026-10-20T15:00:00Z',
  items: [],
  total_items: 2,
  total_quantity: 3,
  delivered_quantity: 0,
  ...overrides,
});

function setState(overrides: Record<string, unknown>) {
  mockState = {
    exitMode: 'direct_customer',
    selectedCustomerId: 'c1',
    selectedUserId: null,
    deliveryOrders: [],
    selectedDeliveryOrderId: null,
    loading: false,
    error: null,
    searchDeliveryOrdersByCustomer: jest.fn(async () => undefined),
    searchDeliveryOrdersByUser: jest.fn(async () => undefined),
    selectDeliveryOrder: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('DeliveryOrderSelector', () => {
  it('cliente: cada fila empieza por el número de la orden y muestra la dirección', () => {
    setState({ deliveryOrders: [order('4126'), order('4127', { delivery_address: 'Vereda El Rosal', notes: 'Llamar antes' })] });
    render(<DeliveryOrderSelector />);

    expect(screen.getByText('OE-2026-4126')).toBeTruthy();
    expect(screen.getByText('OE-2026-4127')).toBeTruthy();
    expect(screen.getByText('Vereda El Rosal')).toBeTruthy();
    expect(screen.getByText('Notas: Llamar antes')).toBeTruthy();
    expect(screen.getByLabelText(/^Orden OE-2026-4126, Ana Gómez/)).toBeTruthy();
  });

  it('remisión: el número primero y el cliente de cada orden debajo', () => {
    setState({
      exitMode: 'direct_user',
      selectedCustomerId: null,
      selectedUserId: 'u1',
      deliveryOrders: [order('9001', { customer_name: 'Luis Pérez' }), order('9002', { customer_name: 'Marta Ruiz' })],
    });
    render(<DeliveryOrderSelector />);

    expect(screen.getByText('OE-2026-9001')).toBeTruthy();
    expect(screen.getByText('Luis Pérez')).toBeTruthy();
    expect(screen.getByText('Marta Ruiz')).toBeTruthy();
  });

  it('sin número usa el inicio del id', () => {
    expect(deliveryOrderLabel({ id: 'abcdef1234567', order_number: null })).toBe('#abcdef12');
  });
});
