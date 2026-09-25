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
      <NegocioPeopleLines createdByName="Ana" sellerOwnerText={null} colors={colors} />
    );
    expect(textOf(getByTestId('negocio-people-created-by'))).toBe('Creado por: Ana');
    expect(queryByTestId('negocio-people-seller')).toBeNull();
  });

  it('con cliente distingue al vendedor (dueño del cliente) de quien lo crea', () => {
    const { getByTestId } = render(
      <NegocioPeopleLines createdByName="Ana" sellerOwnerText="Luis" colors={colors} />
    );
    expect(textOf(getByTestId('negocio-people-seller'))).toBe('Vendedor (dueño del cliente): Luis');
    expect(textOf(getByTestId('negocio-people-created-by'))).toBe('Creado por: Ana');
  });
});
