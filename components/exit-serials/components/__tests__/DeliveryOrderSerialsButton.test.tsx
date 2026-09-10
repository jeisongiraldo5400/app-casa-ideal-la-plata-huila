import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import type { DeliveryOrderSerialRecord } from '../../infrastructure/services/exitSerialsService';
import { DeliveryOrderSerialsButton } from '../DeliveryOrderSerialsButton';

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

function serial(overrides: Partial<DeliveryOrderSerialRecord>): DeliveryOrderSerialRecord {
  return {
    inventoryExitId: 'exit-1',
    productId: 'product-1',
    serial: 'AB123',
    normalized: 'AB123',
    method: 'scan',
    releasedReason: null,
    warehouseId: 'warehouse-1',
    warehouseName: 'Principal',
    exitCreatedAt: '2026-09-10T15:00:00Z',
    ...overrides,
  };
}

describe('DeliveryOrderSerialsButton', () => {
  it('no se muestra sin seriales', () => {
    const screen = render(<DeliveryOrderSerialsButton serials={[]} />);
    expect(screen.queryByText(/Seriales/)).toBeNull();
  });

  it('despliega serial, bodega, forma de captura y estado de cada serial', () => {
    const screen = render(
      <DeliveryOrderSerialsButton
        serials={[
          serial({}),
          serial({ inventoryExitId: 'exit-2', serial: 'CD456', normalized: 'CD456', method: 'manual', releasedReason: 'exit_cancelled' }),
          serial({ inventoryExitId: 'exit-3', serial: 'EF789', normalized: 'EF789', releasedReason: 'returned', warehouseName: 'Norte' }),
        ]}
      />,
    );

    expect(screen.getByText('Seriales (3)')).toBeTruthy();
    expect(screen.queryByText('AB123')).toBeNull();

    fireEvent.press(screen.getByRole('button'));

    expect(screen.getByText('AB123')).toBeTruthy();
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.getByText('Liberado por anulación')).toBeTruthy();
    expect(screen.getByText('Devuelto')).toBeTruthy();
    expect(screen.getAllByText(/Principal · Escaneado/)).toHaveLength(1);
    expect(screen.getByText(/Principal · Digitado/)).toBeTruthy();
    expect(screen.getByText(/Norte · Escaneado/)).toBeTruthy();
    expect(screen.getByText('CD456').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
  });
});
