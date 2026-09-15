import { fireEvent, render } from '@testing-library/react-native';
import React, { useState } from 'react';
import { ProductReviewSheet } from '../ProductReviewSheet';

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

const MESSAGE = 'La cantidad debe ser un número entero';

function Harness({ onChange, onAdd }: { onChange: jest.Mock; onAdd: jest.Mock }) {
  const [quantity, setQuantity] = useState(1);
  return (
    <ProductReviewSheet
      visible
      product={{ name: 'Nevera', sku: 'NEV-1', barcode: '770123' }}
      quantityLabel="Cantidad para agregar"
      quantity={quantity}
      maxQuantity={20}
      valid={quantity > 0 && quantity <= 20}
      error={null}
      onQuantityChange={(next) => {
        setQuantity(next);
        onChange(next);
      }}
      onCancel={jest.fn()}
      onAdd={onAdd}
      onAddAndScan={jest.fn()}
    />
  );
}

describe('ProductReviewSheet: cantidad entera', () => {
  it('«1», «1.» y «1.5» no terminan en 15: el texto queda con el error y no se puede agregar', () => {
    const onChange = jest.fn();
    const onAdd = jest.fn();
    const screen = render(<Harness onChange={onChange} onAdd={onAdd} />);
    const input = screen.getByLabelText('Cantidad para agregar');

    // Así llega letra por letra desde el teclado.
    fireEvent.changeText(input, '1');
    fireEvent.changeText(input, '1.');
    expect(input.props.value).toBe('1.');
    fireEvent.changeText(input, '1.5');

    expect(input.props.value).toBe('1.5');
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(onChange).not.toHaveBeenCalledWith(15);

    fireEvent.press(screen.getByText('Agregar y volver a la lista'));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it.each(['1,5', '1.000'])('«%s» también es inválido', (typed) => {
    const onChange = jest.fn();
    const screen = render(<Harness onChange={onChange} onAdd={jest.fn()} />);
    const input = screen.getByLabelText('Cantidad para agregar');

    fireEvent.changeText(input, typed);

    expect(input.props.value).toBe(typed);
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(onChange).not.toHaveBeenCalledWith(1);
    expect(onChange).not.toHaveBeenCalledWith(1000);
  });

  it('los botones reemplazan un texto inválido', () => {
    const screen = render(<Harness onChange={jest.fn()} onAdd={jest.fn()} />);
    const input = screen.getByLabelText('Cantidad para agregar');

    fireEvent.changeText(input, '1.5');
    fireEvent.press(screen.getByText('1 unidad'));

    expect(input.props.value).toBe('1');
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('un entero sigue funcionando y respeta el máximo', () => {
    const onChange = jest.fn();
    const screen = render(<Harness onChange={onChange} onAdd={jest.fn()} />);
    const input = screen.getByLabelText('Cantidad para agregar');

    fireEvent.changeText(input, '25');
    expect(onChange).toHaveBeenLastCalledWith(20);
    expect(input.props.value).toBe('20');
  });
});
