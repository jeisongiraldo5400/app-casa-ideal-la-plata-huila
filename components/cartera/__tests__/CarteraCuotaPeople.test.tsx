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
  it('caso reportado: quien vendió no aparece como dueño del cliente', () => {
    const { getByTestId, queryByTestId } = render(
      <CarteraCuotaPeople
        colors={colors}
        row={{
          created_by: 'u1',
          created_by_name: 'Ana',
          seller_id: 'u1',
          seller_name: 'Ana',
          customer_seller_name: 'Beto',
        }}
      />
    );
    expect(textOf(getByTestId('cartera-people-registered_by'))).toBe('Registrado por: Ana');
    expect(textOf(getByTestId('cartera-people-customer_seller'))).toBe('Vendedor del cliente: Beto');
    expect(queryByTestId('cartera-people-business_seller')).toBeNull();
  });

  it('cliente sin vendedor y vendedor del negocio distinto de quien registró', () => {
    const { getByTestId } = render(
      <CarteraCuotaPeople
        colors={colors}
        row={{
          created_by: 'u2',
          created_by_name: 'Gestor',
          seller_id: 'u1',
          seller_name: 'Ana',
          customer_seller_name: null,
        }}
      />
    );
    expect(textOf(getByTestId('cartera-people-business_seller'))).toBe('Vendedor del negocio: Ana');
    expect(textOf(getByTestId('cartera-people-customer_seller'))).toBe('Vendedor del cliente: Sin asignar');
  });
});
