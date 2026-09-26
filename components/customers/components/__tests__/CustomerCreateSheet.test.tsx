import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { CustomerCreateSheet } from '../CustomerCreateSheet';

/**
 * Alta de cliente desde el módulo Clientes: el formulario pide el correo
 * electrónico (opcional), lo valida solo si se escribe y lo envía recortado y
 * en minúsculas.
 */

const mockCreateCustomer = jest.fn();
const mockFindCustomer = jest.fn();
jest.mock('../../infrastructure/services/customersService', () => ({
  createCustomer: (input: unknown) => mockCreateCustomer(input),
  isDuplicateCustomerIdNumber: (error: unknown) => error instanceof Error && error.message.startsWith('Ya existe un cliente'),
  findCustomerByIdNumber: (...args: unknown[]) => mockFindCustomer(...args),
}));

jest.mock('@/lib/locations/locationsService', () => ({
  EMPTY_LOCATION_MASTERS: { departamentos: [], municipios: [], veredas: [] },
  fetchLocationMasters: jest.fn(async () => ({ departamentos: [], municipios: [], veredas: [] })),
}));

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
jest.mock('@/hooks/useUserRoles', () => ({ useUserRoles: () => ({ roles: [] }) }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderSheet(onOpenExisting?: (id: string) => void) {
  const onCreated = jest.fn();
  const screen = render(
    <CustomerCreateSheet visible onClose={jest.fn()} onCreated={onCreated} onOpenExisting={onOpenExisting} />
  );
  fireEvent.changeText(screen.getByPlaceholderText('Ej: Juan Pérez'), 'Ana Pérez');
  fireEvent.changeText(screen.getByPlaceholderText('Ej: 1080123456'), '1080123456');
  return { screen, onCreated };
}

describe('CustomerCreateSheet · correo electrónico', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockCreateCustomer.mockReset();
    mockCreateCustomer.mockResolvedValue({
      id: 'c1',
      name: 'Ana Pérez',
      id_number: '1080123456',
      seller_id: null,
      saved_offline: false,
    });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('muestra el campo opcional con teclado de correo y sin mayúsculas automáticas', () => {
    const { screen } = renderSheet();

    expect(screen.getByText('Correo electrónico (opcional)')).toBeTruthy();
    const campo = screen.getByPlaceholderText('Ej: cliente@correo.com');
    expect(campo.props.keyboardType).toBe('email-address');
    expect(campo.props.autoCapitalize).toBe('none');
  });

  it('envía el correo recortado y en minúsculas', async () => {
    const { screen, onCreated } = renderSheet();
    fireEvent.changeText(screen.getByPlaceholderText('Ej: cliente@correo.com'), '  Ana.Perez@Correo.COM ');
    fireEvent.press(screen.getByText('Crear cliente'));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ana Pérez', idNumber: '1080123456', email: 'ana.perez@correo.com' })
    );
  });

  it('sin correo crea el cliente con email null', async () => {
    const { screen, onCreated } = renderSheet();
    fireEvent.press(screen.getByText('Crear cliente'));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it('un correo mal escrito muestra el error y no crea el cliente', async () => {
    const { screen } = renderSheet();
    fireEvent.changeText(screen.getByPlaceholderText('Ej: cliente@correo.com'), 'ana@correo');
    fireEvent.press(screen.getByText('Crear cliente'));

    expect(await screen.findByText('El correo electrónico no tiene un formato válido')).toBeTruthy();
    expect(mockCreateCustomer).not.toHaveBeenCalled();
  });
});

describe('CustomerCreateSheet · documento repetido escrito distinto', () => {
  it('dice de quién es el documento y ofrece ver ese cliente', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCreateCustomer.mockReset();
    mockCreateCustomer.mockRejectedValue(new Error('Ya existe un cliente con el documento 1080123456 (Ana Ruiz).'));
    mockFindCustomer.mockResolvedValue({ id: 'c9', name: 'Ana Ruiz', id_number: '1.080.123.456', deleted: false });
    const onOpenExisting = jest.fn();
    const { screen } = renderSheet(onOpenExisting);
    fireEvent.press(screen.getByText('Crear cliente'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Cliente ya registrado');
    expect(message).toBe('El documento 1080123456 (registrado como 1.080.123.456) ya es de Ana Ruiz. ¿Quieres ver ese cliente?');
    buttons.find((button) => button.text === 'Ver cliente')?.onPress?.();
    expect(onOpenExisting).toHaveBeenCalledWith('c9');
    alert.mockRestore();
  });
});
