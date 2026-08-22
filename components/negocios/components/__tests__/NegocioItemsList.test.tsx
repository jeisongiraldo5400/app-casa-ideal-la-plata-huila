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

function ItemsHarness() {
  const [items, setItems] = useState<NegocioItem[]>([
    {
      product_id: 'product-1',
      warehouse_id: 'warehouse-1',
      quantity: 1,
      description: 'Nevera Samsung 300L',
      unit_price: 2,
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
});
