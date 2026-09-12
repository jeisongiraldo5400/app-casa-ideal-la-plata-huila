import { fireEvent, render } from '@testing-library/react-native';
import { NegocioOriginGroupsSection } from '../NegocioOriginGroupsSection';
import type { RemissionOriginGroup } from '../../infrastructure/services/negociosDeliveryOrdersService';

// El Icon real carga la fuente de forma asíncrona y hace setState fuera de act(...).
jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name),
  };
});

const colors = {
  text: { primary: '#111827', secondary: '#6b7280' },
  primary: { main: '#1e3a8a', contrastText: '#ffffff' },
  background: { default: '#f7f5f1', paper: '#ffffff' },
  divider: '#d1d5db',
};

const item = {
  product_id: 'p1',
  product_name: 'Base',
  warehouse_id: 'w1',
  warehouse_name: 'Principal',
  quantity: 2,
  available_quantity: 2,
  sale_price: 200,
};

const own: RemissionOriginGroup = {
  kind: 'own',
  sourceOrderId: 'rem-1',
  label: 'Productos propios de la remisión',
  customerId: null,
  customerName: null,
  hasNegocio: false,
  items: [item],
};

const childFree: RemissionOriginGroup = {
  kind: 'child',
  sourceOrderId: 'oe-a',
  label: 'Productos de la OE-0010 (Ana)',
  customerId: 'c1',
  customerName: 'Ana',
  hasNegocio: false,
  items: [item],
};

const childTaken: RemissionOriginGroup = {
  ...childFree,
  sourceOrderId: 'oe-b',
  label: 'Productos de la OE-0011 (Beatriz)',
  hasNegocio: true,
};

describe('NegocioOriginGroupsSection', () => {
  it('permite elegir propios o una OE hija libre y bloquea la que ya tiene negocio', () => {
    const onSelectGroup = jest.fn();
    const { getByText } = render(
      <NegocioOriginGroupsSection
        groups={[own, childFree, childTaken]}
        loading={false}
        selectedGroup={null}
        onSelectGroup={onSelectGroup}
        colors={colors}
      />
    );

    fireEvent.press(getByText('Productos propios de la remisión'));
    fireEvent.press(getByText('Productos de la OE-0010 (Ana)'));
    fireEvent.press(getByText('Productos de la OE-0011 (Beatriz)'));

    expect(onSelectGroup).toHaveBeenCalledTimes(2);
    expect(onSelectGroup).toHaveBeenNthCalledWith(1, own);
    expect(onSelectGroup).toHaveBeenNthCalledWith(2, childFree);
    expect(getByText('Ya tiene negocio asociado')).toBeTruthy();
  });

  it('muestra el estado vacío cuando la remisión no tiene grupos', () => {
    const { getByText } = render(
      <NegocioOriginGroupsSection
        groups={[]}
        loading={false}
        selectedGroup={null}
        onSelectGroup={jest.fn()}
        colors={colors}
      />
    );
    expect(getByText('La remisión no tiene productos disponibles para un negocio.')).toBeTruthy();
  });
});
