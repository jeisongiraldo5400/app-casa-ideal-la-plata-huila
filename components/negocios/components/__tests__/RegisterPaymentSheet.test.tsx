import React, { useState } from 'react';
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

describe('RegisterPaymentSheet · valor con centavos', () => {
  /** Hoja controlada como en el detalle del negocio: el padre guarda el texto que devuelve. */
  function ControlledSheet({
    onSubmit,
    amountDecimalPlaces,
  }: {
    onSubmit: (amount: string) => void;
    amountDecimalPlaces?: number;
  }) {
    const [amount, setAmount] = useState('');
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <RegisterPaymentSheet
          visible
          onClose={jest.fn()}
          subtitle="NEG-001 · Cliente"
          pendingBalance={280_000}
          amount={amount}
          onChangeAmount={setAmount}
          amountDecimalPlaces={amountDecimalPlaces}
          receipt=""
          onChangeReceipt={jest.fn()}
          paymentMethods={[{ id: 'pm-1', name: 'Efectivo' }]}
          paymentMethodId="pm-1"
          onChangePaymentMethod={jest.fn()}
          supportFile={null}
          onPickSupport={jest.fn()}
          onRemoveSupport={jest.fn()}
          saving={false}
          onSubmit={() => onSubmit(amount)}
        />
      </SafeAreaProvider>
    );
  }

  /** Teclea sobre el texto que pinta el campo, como hace `TextInput`. */
  function typeInto(getField: () => ReturnType<ReturnType<typeof render>['getByLabelText']>, keys: string) {
    for (const key of keys) {
      const current = String(getField().props.value ?? '');
      fireEvent.changeText(getField(), key === '<' ? current.slice(0, -1) : `${current}${key}`);
    }
  }

  it('usa teclado decimal y admite coma de centavos', () => {
    const onSubmit = jest.fn();
    const { getByLabelText, getByText } = render(<ControlledSheet onSubmit={onSubmit} />);
    const field = () => getByLabelText('Valor del pago');

    expect(field().props.keyboardType).toBe('decimal-pad');
    typeInto(field, '93333,33');
    expect(field().props.value).toBe('93.333,33');

    fireEvent.press(getByText('Guardar pago'));
    expect(onSubmit).toHaveBeenCalledWith('93.333,33');
  });

  it('el punto del teclado de Android también abre los centavos y borrar respeta los miles', () => {
    const { getByLabelText } = render(<ControlledSheet onSubmit={jest.fn()} />);
    const field = () => getByLabelText('Valor del pago');

    typeInto(field, '93333.3');
    expect(field().props.value).toBe('93.333,3');
    typeInto(field, '<<<');
    expect(field().props.value).toBe('9.333');
  });

  it('pegar «93333.33» se lee como 93.333,33', () => {
    const { getByLabelText } = render(<ControlledSheet onSubmit={jest.fn()} />);

    fireEvent.changeText(getByLabelText('Valor del pago'), '93333.33');

    expect(getByLabelText('Valor del pago').props.value).toBe('93.333,33');
  });

  it('si la configuración no admite decimales vuelve al teclado numérico', () => {
    const { getByLabelText } = render(<ControlledSheet onSubmit={jest.fn()} amountDecimalPlaces={0} />);
    const field = () => getByLabelText('Valor del pago');

    expect(field().props.keyboardType).toBe('number-pad');
    typeInto(field, '1500,5');
    expect(field().props.value).toBe('15.005');
  });
});
