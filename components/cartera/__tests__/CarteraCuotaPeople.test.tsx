import { render } from '@testing-library/react-native';
import React from 'react';
import { CarteraCuotaPeople } from '../CarteraCuotaPeople';

const colors = { text: { primary: '#000', secondary: '#666' } };
const textOf = (node: { props: { children: unknown } }) =>
  (Array.isArray(node.props.children) ? node.props.children : [node.props.children])
    .map((child: unknown) =>
      typeof child === 'string' ? child : (child as { props: { children: string } }).props.children
    )
    .join('');

describe('CarteraCuotaPeople', () => {
  it('vendedor = dueño del cliente; quien lo creó va aparte', () => {
    const { getByTestId, queryByTestId } = render(
      <CarteraCuotaPeople
        colors={colors}
        row={{
          created_by: 'u1',
          created_by_name: 'Ana',
          seller_id: 'u2',
          seller_name: 'Beto',
          customer_seller_id: 'u2',
          customer_seller_name: 'Beto',
        }}
      />
    );
    expect(textOf(getByTestId('cartera-people-customer_seller'))).toBe('Vendedor (dueño del cliente): Beto');
    expect(textOf(getByTestId('cartera-people-registered_by'))).toBe('Creado por: Ana');
    expect(queryByTestId('cartera-people-business_seller')).toBeNull();
  });

  it('cliente sin vendedor y negocio con vendedor guardado', () => {
    const { getByTestId } = render(
      <CarteraCuotaPeople
        colors={colors}
        row={{
          created_by: 'u2',
          created_by_name: 'Gestor',
          seller_id: 'u1',
          seller_name: 'Ana',
          customer_seller_id: null,
          customer_seller_name: null,
        }}
      />
    );
    expect(textOf(getByTestId('cartera-people-business_seller'))).toBe('Vendedor registrado en el negocio: Ana');
    expect(textOf(getByTestId('cartera-people-customer_seller'))).toBe('Vendedor (dueño del cliente): Sin asignar');
  });
});
