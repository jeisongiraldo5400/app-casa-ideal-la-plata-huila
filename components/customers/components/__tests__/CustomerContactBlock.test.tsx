import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
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

describe('CustomerContactBlock · teléfono 2', () => {
  let alert: jest.SpyInstance;
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('la ficha muestra los dos teléfonos', () => {
    const screen = render(
      <CustomerContactBlock customer={{ ...customer, phone: '300 111 2222', phone_secondary: '310 555 0101' }} />
    );
    expect(screen.getByText(/300 111 2222/)).toBeTruthy();
    expect(screen.getByText(/310 555 0101/)).toBeTruthy();
    expect(screen.getByText(/Teléfono 2/)).toBeTruthy();
  });

  it('con dos números, Llamar pregunta a cuál y marca el elegido', async () => {
    const screen = render(
      <CustomerContactBlock actionsOnly customer={{ ...customer, phone: '300 111 2222', phone_secondary: '310 555 0101' }} />
    );
    fireEvent.press(screen.getByText('Llamar'));

    expect(alert).toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((button) => button.text)).toEqual(['300 111 2222', '310 555 0101', 'Cancelar']);
    buttons[1].onPress?.();
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('tel:3105550101'));
  });

  it('solo con el teléfono 2 WhatsApp abre ese número sin preguntar', async () => {
    const screen = render(<CustomerContactBlock actionsOnly customer={{ ...customer, phone_secondary: '3105550101' }} />);
    fireEvent.press(screen.getByText('WhatsApp'));

    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://wa.me/573105550101'));
  });
});
