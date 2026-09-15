import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { NegocioItemsList } from '../NegocioItemsList';
import type { NegocioItem } from '../../infrastructure/store/negociosStore';

const colors = {
  text: { primary: '#111827', secondary: '#6b7280' },
  primary: { main: '#1e3a8a', contrastText: '#ffffff' },
  background: { default: '#f7f5f1', paper: '#ffffff' },
  divider: '#d1d5db',
};

function ItemsHarness({ initialPrice = 2 }: { initialPrice?: number }) {
  const [items, setItems] = useState<NegocioItem[]>([
    {
      product_id: 'product-1',
      warehouse_id: 'warehouse-1',
      quantity: 1,
      description: 'Nevera Samsung 300L',
      unit_price: initialPrice,
    },
  ]);

  return (
    <NegocioItemsList
      items={items}
      stockByProduct={{
        'product-1': [
          {
            warehouse_id: 'warehouse-1',
            warehouse_name: 'Bodega principal',
            quantity: 24,
          },
        ],
      }}
      onUpdateItem={(index, patch) =>
        setItems((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...patch } : item
          )
        )
      }
      onRemoveItem={() => undefined}
      colors={colors}
    />
  );
}

describe('NegocioItemsList', () => {
  it('permite borrar el precio actual y escribir uno nuevo', () => {
    const screen = render(<ItemsHarness />);
    const input = screen.getByLabelText('Valor unitario de Nevera Samsung 300L');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, '');
    expect(input.props.value).toBe('');

    fireEvent.changeText(input, '2400000');
    expect(input.props.value).toBe('2.400.000');

    fireEvent(input, 'blur');
    expect(input.props.value).toBe('2.400.000');
    expect(screen.getByText('$ 2.400.000')).toBeTruthy();
  });

  it('deja vacío el valor unitario de un producto sin precio', () => {
    const screen = render(<ItemsHarness initialPrice={0} />);
    const input = screen.getByLabelText('Valor unitario de Nevera Samsung 300L');

    expect(input.props.value).toBe('');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, '850000');
    fireEvent(input, 'blur');
    expect(input.props.value).toBe('850.000');
  });

  it('permite borrar la cantidad y escribir otra sin concatenar dígitos', () => {
    const screen = render(<ItemsHarness />);
    const input = screen.getByLabelText('Cantidad de Nevera Samsung 300L');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, '');
    expect(input.props.value).toBe('');

    fireEvent.changeText(input, '5');
    expect(input.props.value).toBe('5');
    expect(screen.getByText('$ 10')).toBeTruthy();

    fireEvent(input, 'blur');
    expect(input.props.value).toBe('5');
  });

  it('restaura la cantidad vigente al salir con un valor vacío', () => {
    const screen = render(<ItemsHarness />);
    const input = screen.getByLabelText('Cantidad de Nevera Samsung 300L');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(input.props.value).toBe('1');
  });
  it.each(['1.5', '1,5', '1.000'])(
    'con «%s» muestra el error, deja la línea en 0 y nunca la convierte en 15 ni 1',
    (typed) => {
      const screen = render(<ItemsHarness initialPrice={10} />);
      const input = screen.getByLabelText('Cantidad de Nevera Samsung 300L');

      fireEvent(input, 'focus');
      fireEvent.changeText(input, typed);
      expect(input.props.value).toBe(typed);
      expect(screen.getByText('La cantidad debe ser un número entero')).toBeTruthy();
      // Subtotal 0: la línea no vale ni 15 ni 1 unidades.
      expect(screen.getByText('$ 0')).toBeTruthy();
      expect(screen.queryByText('$ 150')).toBeNull();

      fireEvent(input, 'blur');
      expect(input.props.value).toBe(typed);
      expect(screen.getByText('La cantidad debe ser un número entero')).toBeTruthy();

      fireEvent(input, 'focus');
      fireEvent.changeText(input, '2');
      fireEvent(input, 'blur');
      expect(input.props.value).toBe('2');
      expect(screen.queryByText('La cantidad debe ser un número entero')).toBeNull();
      expect(screen.getByText('$ 20')).toBeTruthy();
    }
  );
});
