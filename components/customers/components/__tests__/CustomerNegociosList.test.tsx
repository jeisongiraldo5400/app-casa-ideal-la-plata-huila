import { render } from '@testing-library/react-native';
import { CustomerNegociosList } from '../CustomerNegociosList';
import type { CustomerNegocioItem } from '@/lib/customers/customerNegocios';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => ReactModule.createElement(Text, null, name) };
});
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const negocio = (id: string, numero: number) =>
  ({
    negocio_id: id,
    negocio_numero: numero,
    status: 'activo',
    deal_date: '2026-09-01',
    total_credit: 1000000,
    remaining_balance: 500000,
    role_in_negocio: 'titular',
    direccion: 'Calle 1',
    municipio_name: 'Inzá',
    has_mora: false,
  }) as unknown as CustomerNegocioItem;

describe('CustomerNegociosList · productos de cada negocio', () => {
  it('muestra los productos dentro de cada negocio', () => {
    const screen = render(
      <CustomerNegociosList
        negocios={[negocio('n1', 20260001), negocio('n2', 20260002)]}
        onOpen={jest.fn()}
        productsByNegocio={
          new Map([
            ['n1', [{ name: 'Colchón doble', sku: 'COL-2', quantity: 2 }]],
            ['n2', [{ name: 'Base cama', sku: null, quantity: 1 }]],
          ])
        }
      />
    );
    expect(screen.getAllByText('Productos')).toHaveLength(2);
    expect(screen.getByText(/2 × Colchón doble/)).toBeTruthy();
    expect(screen.getByText(/1 × Base cama/)).toBeTruthy();
  });

  it('mientras carga lo dice, y un negocio sin productos también', () => {
    const loading = render(
      <CustomerNegociosList negocios={[negocio('n1', 20260001)]} onOpen={jest.fn()} productsLoading />
    );
    expect(loading.getByText('Cargando productos…')).toBeTruthy();
    const empty = render(
      <CustomerNegociosList negocios={[negocio('n1', 20260001)]} onOpen={jest.fn()} productsByNegocio={new Map()} />
    );
    expect(empty.getByText('Sin productos registrados')).toBeTruthy();
  });
});
