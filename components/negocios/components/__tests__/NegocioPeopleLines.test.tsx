import { render } from '@testing-library/react-native';
import React from 'react';
import { NegocioPeopleLines } from '../NegocioPeopleLines';

const colors = { text: { primary: '#000', secondary: '#666' } };
const textOf = (node: { props: { children: unknown } }) =>
  (Array.isArray(node.props.children) ? node.props.children : [node.props.children])
    .map((child: unknown) =>
      typeof child === 'string' ? child : (child as { props: { children: string } }).props.children
    )
    .join('');

describe('NegocioPeopleLines', () => {
  it('sin cliente muestra solo quién crea el negocio', () => {
    const { getByTestId, queryByTestId } = render(
      <NegocioPeopleLines createdByName="Ana" customerSellerText={null} colors={colors} />
    );
    expect(textOf(getByTestId('negocio-people-created-by'))).toBe('Creado por: Ana');
    expect(queryByTestId('negocio-people-customer-seller')).toBeNull();
    expect(queryByTestId('negocio-people-seller')).toBeNull();
  });

  it('con cliente y en la confirmación distingue a las tres personas', () => {
    const { getByTestId } = render(
      <NegocioPeopleLines
        sellerName="Carlos"
        createdByName="Ana"
        customerSellerText="Luis"
        colors={colors}
      />
    );
    expect(textOf(getByTestId('negocio-people-seller'))).toBe('Vendedor del negocio: Carlos');
    expect(textOf(getByTestId('negocio-people-created-by'))).toBe('Creado por: Ana');
    expect(textOf(getByTestId('negocio-people-customer-seller'))).toBe('Vendedor del cliente: Luis');
  });
});
