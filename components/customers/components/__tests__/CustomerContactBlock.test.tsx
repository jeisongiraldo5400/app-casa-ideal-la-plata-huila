import { render } from '@testing-library/react-native';
import React from 'react';
import { CustomerContactBlock } from '../CustomerContactBlock';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));

const customer = {
  name: 'Ana',
  id_number: '123',
  phone: null as string | null,
  email: null,
  address: 'Finca La Playa',
  vereda_name: null,
  municipio_name: 'Álamo',
  departamento_name: null,
};

describe('CustomerContactBlock (solo acciones)', () => {
  it('sin teléfono oculta WhatsApp y deja Llamar deshabilitado; el mapa abre la dirección', () => {
    const screen = render(<CustomerContactBlock actionsOnly customer={customer} />);
    expect(screen.queryByText('WhatsApp')).toBeNull();
    expect(screen.getByText('Llamar')).toBeTruthy();
    expect(screen.getByText('Mapa')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull();
  });

  it('con celular muestra WhatsApp', () => {
    const screen = render(<CustomerContactBlock actionsOnly customer={{ ...customer, phone: '300 123 4567' }} />);
    expect(screen.getByText('WhatsApp')).toBeTruthy();
  });
});
