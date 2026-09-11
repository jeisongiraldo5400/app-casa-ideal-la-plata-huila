import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RegisterPaymentSheet } from '../RegisterPaymentSheet';

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

/** El selector de método usa `useSafeAreaInsets`, que exige el proveedor. */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(overrides: Partial<React.ComponentProps<typeof RegisterPaymentSheet>> = {}) {
  const props = {
    visible: true,
    onClose: jest.fn(),
    subtitle: 'NEG-001 · Cliente',
    pendingBalance: 100_000,
    amount: '',
    onChangeAmount: jest.fn(),
    receipt: '',
    onChangeReceipt: jest.fn(),
    paymentMethods: [
      { id: 'pm-1', name: 'Efectivo' },
      { id: 'pm-2', name: 'Consignación' },
    ],
    paymentMethodId: 'pm-1',
    onChangePaymentMethod: jest.fn(),
    supportFile: null,
    onPickSupport: jest.fn(),
    onRemoveSupport: jest.fn(),
    saving: false,
    onSubmit: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <RegisterPaymentSheet {...props} />
      </SafeAreaProvider>
    ),
    props,
  };
}

describe('RegisterPaymentSheet', () => {
  it('muestra las opciones de soporte dentro de la hoja y permite cancelarlas', () => {
    const { getByText, getByLabelText, queryByText, props } = renderSheet();

    fireEvent.press(getByText('Adjuntar soporte (opcional)'));
    expect(getByText('Tomar foto')).toBeTruthy();
    expect(getByText('Galería')).toBeTruthy();
    expect(getByText('Archivo / PDF')).toBeTruthy();
    expect(queryByText('Quitar soporte')).toBeNull();

    fireEvent.press(getByLabelText('Cancelar selección de soporte'));
    expect(queryByText('Tomar foto')).toBeNull();
    expect(getByText('Adjuntar soporte (opcional)')).toBeTruthy();
    expect(props.onPickSupport).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('notifica el origen elegido y vuelve al estado inicial', () => {
    const { getByText, queryByText, props } = renderSheet();

    fireEvent.press(getByText('Adjuntar soporte (opcional)'));
    fireEvent.press(getByText('Galería'));

    expect(props.onPickSupport).toHaveBeenCalledWith('gallery');
    expect(queryByText('Tomar foto')).toBeNull();
  });

  it('permite quitar un soporte ya adjunto', () => {
    const { getByText, props } = renderSheet({
      supportFile: { uri: 'file:///tmp/soporte.jpg', mimeType: 'image/jpeg', name: 'soporte.jpg' },
    });

    fireEvent.press(getByText('soporte.jpg'));
    fireEvent.press(getByText('Quitar soporte'));

    expect(props.onRemoveSupport).toHaveBeenCalledTimes(1);
    expect(props.onPickSupport).not.toHaveBeenCalled();
  });
});

describe('RegisterPaymentSheet · método de pago', () => {
  it('bloquea el guardado mientras no se elige un método', () => {
    const { getByText, props } = renderSheet({ paymentMethodId: '' });

    fireEvent.press(getByText('Guardar pago'));

    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('permite guardar cuando ya hay un método elegido', () => {
    const { getByText, props } = renderSheet({ paymentMethodId: 'pm-2' });

    fireEvent.press(getByText('Guardar pago'));

    expect(props.onSubmit).toHaveBeenCalled();
  });

  it('avisa cuando el catálogo está vacío', () => {
    const { getByText } = renderSheet({ paymentMethods: [], paymentMethodId: '' });

    expect(getByText('No hay métodos de pago configurados. Pídalos al administrador.')).toBeTruthy();
  });
});
