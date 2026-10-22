import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DraftOriginChangeSheet } from '../DraftOriginChangeSheet';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(RNText, null, name) };
});
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const order = {
  id: 'oe-1',
  order_number: 'OE-2026-1',
  order_type: 'customer',
  customer_id: 'c-1',
  customer_name: 'Cliente Uno',
  status: 'pending',
  items: [{ product_id: 'p-1', product_name: 'Nevera', available_quantity: 1 }],
};

jest.mock('../../infrastructure/hooks/useOriginOrderSearch', () => ({
  useOriginOrderSearch: () => ({
    query: '',
    setQuery: jest.fn(),
    orders: [order],
    loading: false,
    error: null,
    fromLocal: false,
    snapshotAt: null,
  }),
}));

// El selector real es una lista con búsqueda; aquí basta un botón que elige la orden.
jest.mock('../NegocioOriginOrderPicker', () => ({
  NegocioOriginOrderPicker: ({ orders, onSelect }: { orders: unknown[]; onSelect: (o: unknown) => void }) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    const RN = jest.requireActual<typeof import('react-native')>('react-native');
    return ReactModule.createElement(
      RN.Pressable,
      { testID: 'pick-order', onPress: () => onSelect(orders[0]) },
      ReactModule.createElement(RN.Text, null, 'Elegir')
    );
  },
}));

const mockCheck = jest.fn();
jest.mock('../../infrastructure/services/draftOriginChangeService', () => ({
  checkDraftSource: (...args: unknown[]) => mockCheck(...args),
  changeDraftSource: jest.fn(),
  savePreparedDraftOriginChange: jest.fn(async () => undefined),
}));
jest.mock('../../infrastructure/services/negociosDeliveryOrdersService', () => ({
  fetchRemissionOriginProducts: jest.fn(async () => []),
}));
jest.mock('../../infrastructure/services/negociosOfflineOrdersService', () => ({
  fetchLocalRemissionOriginGroups: jest.fn(async () => []),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function sheet(offline: boolean) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <DraftOriginChangeSheet
        visible
        onClose={jest.fn()}
        negocioId="n-1"
        customerId="c-1"
        items={[{ product_id: 'p-1', quantity: 1, product_name: 'Nevera' }]}
        offline={offline}
        onChanged={jest.fn()}
        onPrepared={jest.fn()}
      />
    </SafeAreaProvider>
  );
}

describe('DraftOriginChangeSheet', () => {
  beforeEach(() => mockCheck.mockReset());

  it('si se pierde la señal mientras revisa con el servidor, no se queda «Revisando…» y deja preparar', () => {
    // La revisión nunca responde: la señal se fue a mitad de camino.
    mockCheck.mockReturnValue(new Promise(() => undefined));
    const view = render(sheet(false));
    fireEvent.press(screen.getByTestId('pick-order'));
    expect(screen.getByText('Revisando con el servidor…')).toBeTruthy();

    view.rerender(sheet(true));

    expect(screen.queryByText('Revisando con el servidor…')).toBeNull();
    const prepare = screen.getByRole('button', { name: /Preparar cambio/ });
    expect(prepare.props.accessibilityState?.disabled).toBe(false);
  });
});
