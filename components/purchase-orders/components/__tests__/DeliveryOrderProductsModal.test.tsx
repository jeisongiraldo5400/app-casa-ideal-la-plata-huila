import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { deliveryOrderSerialKey } from '@/components/exit-serials/infrastructure/services/exitSerialsService';
import { toDeliveryOrderItem } from '../../domain/deliveryOrderItem';
import { DeliveryOrderProductsModal } from '../DeliveryOrderProductsModal';

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
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

const items = [
  toDeliveryOrderItem({
    id: 'item-1', product_id: 'p1', product_name: 'Nevera', product_sku: 'NEV', product_barcode: null,
    warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 2, delivered_quantity: 1,
  }),
  toDeliveryOrderItem({
    id: 'item-2', product_id: 'p2', product_name: 'Lavadora', product_sku: 'LAV', product_barcode: null,
    warehouse_id: 'w1', warehouse_name: 'Principal', quantity: 1, delivered_quantity: 0,
  }),
];

const serialsByLine = {
  [deliveryOrderSerialKey('p1', 'w1')]: [
    {
      inventoryExitId: 'exit-1', productId: 'p1', serial: 'AB-123', normalized: 'AB123', method: 'scan' as const,
      releasedReason: null, warehouseId: 'w1', warehouseName: 'Principal', exitCreatedAt: '2026-09-10T15:00:00Z',
    },
  ],
};

function renderModal(loadSerials: jest.Mock) {
  return render(
    <DeliveryOrderProductsModal
      visible
      onClose={jest.fn()}
      orderId="order-1"
      orderNumber="OE-1"
      loadItems={jest.fn().mockResolvedValue(items)}
      loadSerials={loadSerials}
    />,
  );
}

describe('DeliveryOrderProductsModal · seriales', () => {
  it('muestra "Seriales (N)" solo en el producto entregado con seriales', async () => {
    const loadSerials = jest.fn().mockResolvedValue(serialsByLine);
    const screen = renderModal(loadSerials);

    await waitFor(() => expect(screen.getByText('Seriales (1)')).toBeTruthy());
    expect(loadSerials).toHaveBeenCalledWith('order-1');
    expect(screen.getAllByText(/Seriales \(/)).toHaveLength(1);

    fireEvent.press(screen.getByText('Seriales (1)'));
    expect(screen.getByText('AB-123')).toBeTruthy();
  });

  it('encuentra el producto por serial sin importar guiones ni mayúsculas', async () => {
    const screen = renderModal(jest.fn().mockResolvedValue(serialsByLine));
    await waitFor(() => expect(screen.getByText('Seriales (1)')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('Buscar por nombre, SKU, código o serial...'), 'ab123');

    expect(screen.getByText('Nevera')).toBeTruthy();
    expect(screen.queryByText('Lavadora')).toBeNull();
  });

  it('si los seriales fallan la lista de productos se ve igual', async () => {
    const screen = renderModal(jest.fn().mockRejectedValue(new Error('sin red')));

    await waitFor(() => expect(screen.getByText('Nevera')).toBeTruthy());
    expect(screen.getByText('Lavadora')).toBeTruthy();
    expect(screen.queryByText(/Seriales \(/)).toBeNull();
    expect(screen.queryByText('Reintentar')).toBeNull();
  });
});
