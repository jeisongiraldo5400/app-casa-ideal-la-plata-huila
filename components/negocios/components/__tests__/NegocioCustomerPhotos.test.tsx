import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { NegocioCustomerPhotosView } from '../NegocioCustomerPhotosView';
import { NegocioCustomerPhotosSection } from '../NegocioCustomerPhotosSection';
import { pickNegocioPhoto } from '../../infrastructure/services/pickNegocioPhoto';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('../../infrastructure/services/pickNegocioPhoto', () => ({ pickNegocioPhoto: jest.fn() }));

const mockSigned = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: (bucket: string) => ({ createSignedUrl: (path: string, ttl: number) => mockSigned(bucket, path, ttl) }) } },
}));

describe('NegocioCustomerPhotosView (detalle)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSigned.mockImplementation(async (_bucket: string, path: string) => ({
      data: { signedUrl: `https://firmada/${path}` },
      error: null,
    }));
  });

  it('con señal muestra las miniaturas con URL firmada de 1 h y amplía al tocar', async () => {
    const screen = render(
      <NegocioCustomerPhotosView customerPhotoPath="u1/a.jpg" idPhotoPath="u1/b.jpg" online />
    );

    await waitFor(() => expect(screen.getByTestId('negocio-foto-cedula')).toBeTruthy());
    expect(mockSigned).toHaveBeenCalledWith('negocios-fotos', 'u1/a.jpg', 3600);
    expect(mockSigned).toHaveBeenCalledWith('negocios-fotos', 'u1/b.jpg', 3600);
    expect(screen.getByTestId('negocio-foto-cliente').props.source).toEqual({ uri: 'https://firmada/u1/a.jpg' });

    fireEvent.press(screen.getByLabelText('Ampliar cédula (frente)'));
    expect(screen.getByLabelText('Cerrar foto')).toBeTruthy();
  });

  it('muestra la cédula por el frente y por atrás con sus nombres', async () => {
    const screen = render(
      <NegocioCustomerPhotosView customerPhotoPath={null} idPhotoPath="u1/b.jpg" idBackPhotoPath="u1/c.jpg" online />
    );
    await waitFor(() => expect(screen.getByTestId('negocio-foto-cedula_atras')).toBeTruthy());
    expect(mockSigned).toHaveBeenCalledWith('negocios-fotos', 'u1/c.jpg', 3600);
    expect(screen.getByText('Cédula (frente)')).toBeTruthy();
    expect(screen.getByText('Cédula (atrás)')).toBeTruthy();
  });

  it('solo la cédula: una sola miniatura', async () => {
    const screen = render(<NegocioCustomerPhotosView customerPhotoPath={null} idPhotoPath="u1/b.jpg" online />);
    await waitFor(() => expect(screen.getByTestId('negocio-foto-cedula')).toBeTruthy());
    expect(screen.queryByText('Foto del cliente')).toBeNull();
  });

  it('sin señal o sin fotos no muestra nada ni pide URLs', () => {
    const offline = render(<NegocioCustomerPhotosView customerPhotoPath="u1/a.jpg" idPhotoPath={null} online={false} />);
    expect(offline.queryByText('Fotos del cliente')).toBeNull();
    const empty = render(<NegocioCustomerPhotosView customerPhotoPath={null} idPhotoPath={null} online />);
    expect(empty.queryByText('Fotos del cliente')).toBeNull();
    expect(mockSigned).not.toHaveBeenCalled();
  });

  it('una URL que no se puede firmar no tumba la vista', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSigned.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const screen = render(
      <NegocioCustomerPhotosView customerPhotoPath="u1/a.jpg" idPhotoPath="u1/b.jpg" online />
    );
    await waitFor(() => expect(screen.getByTestId('negocio-foto-cedula')).toBeTruthy());
    expect(screen.queryByTestId('negocio-foto-cliente')).toBeNull();
    spy.mockRestore();
  });
});

describe('NegocioCustomerPhotosSection (asistente)', () => {
  const photo = { id: 'f1', uri: 'file:///f1.jpg', mimeType: 'image/jpeg', size: 10 };

  it('ofrece tomar foto o galería para cada una y avisa que es opcional', async () => {
    (pickNegocioPhoto as jest.Mock).mockResolvedValue(photo);
    const onChange = jest.fn();
    const screen = render(<NegocioCustomerPhotosSection customerPhoto={null} idPhoto={null} onChange={onChange} />);

    expect(screen.getByText('Fotos del cliente (opcional)')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tomar cédula (frente)'));
    });
    expect(pickNegocioPhoto).toHaveBeenCalledWith('camera');
    expect(onChange).toHaveBeenCalledWith('cedula', photo);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Elegir foto del cliente de la galería'));
    });
    expect(pickNegocioPhoto).toHaveBeenLastCalledWith('gallery');
    expect(onChange).toHaveBeenLastCalledWith('cliente', photo);
  });

  it('tiene dos espacios para la cédula: frente y atrás', async () => {
    (pickNegocioPhoto as jest.Mock).mockResolvedValue(photo);
    const onChange = jest.fn();
    const screen = render(
      <NegocioCustomerPhotosSection customerPhoto={null} idPhoto={photo} idBackPhoto={null} onChange={onChange} />
    );
    expect(screen.getByText('Cédula (frente)')).toBeTruthy();
    expect(screen.getByText('Cédula (atrás)')).toBeTruthy();
    expect(screen.getByLabelText('Cédula (frente): foto adjunta')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tomar cédula (atrás)'));
    });
    expect(onChange).toHaveBeenCalledWith('cedula_atras', photo);
  });

  it('con foto muestra la miniatura y «Quitar»', () => {
    const onChange = jest.fn();
    const screen = render(<NegocioCustomerPhotosSection customerPhoto={photo} idPhoto={null} onChange={onChange} />);
    expect(screen.getByLabelText('Foto del cliente: foto adjunta')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Quitar foto del cliente'));
    expect(onChange).toHaveBeenCalledWith('cliente', null);
  });
});
