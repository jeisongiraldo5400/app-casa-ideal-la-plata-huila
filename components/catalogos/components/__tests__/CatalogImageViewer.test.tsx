import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { CatalogImageViewer } from '../CatalogImageViewer';
import { CatalogProductThumb } from '../CatalogProductThumb';
import { getPublicCatalogProductDetails } from '../../infrastructure/services/publicCatalogService';

jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../infrastructure/services/publicCatalogService', () => ({ getPublicCatalogProductDetails: jest.fn() }));

const mockDetails = getPublicCatalogProductDetails as jest.MockedFunction<typeof getPublicCatalogProductDetails>;

function image(id: string, url: string, isCover = false, sortOrder = 0) {
  return { id, type: 'IMAGE', bucket: 'catalog-images', storagePath: id, thumbnailPath: null, posterPath: null, title: null, altText: null, isCover, sortOrder, metadata: {}, publicUrl: url };
}

describe('CatalogImageViewer', () => {
  beforeEach(() => mockDetails.mockReset());

  it('muestra la portada al instante y luego todas las fotos de la ficha', async () => {
    mockDetails.mockResolvedValue(
      new Map([['silla', { media: [image('b', 'https://x/b.jpg', false, 2), image('a', 'https://x/a.jpg', true)] }]]) as never
    );
    const screen = render(<CatalogImageViewer target={{ title: 'Silla', coverUrl: 'https://x/a.jpg', slug: 'silla' }} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Silla, foto 1')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 / 2')).toBeTruthy());
    expect(mockDetails).toHaveBeenCalledWith(['silla']);
  });

  it('sin señal se queda con la portada, sin error', async () => {
    mockDetails.mockRejectedValue(new Error('Network request failed'));
    const screen = render(<CatalogImageViewer target={{ title: 'Mesa', coverUrl: 'https://x/m.jpg', slug: 'mesa' }} onClose={jest.fn()} />);

    await waitFor(() => expect(mockDetails).toHaveBeenCalled());
    expect(screen.getByLabelText('Mesa, foto 1')).toBeTruthy();
    expect(screen.queryByText(/\/ /)).toBeNull();
  });

  it('una portada de edición (sin slug) no consulta nada', () => {
    const onClose = jest.fn();
    const screen = render(<CatalogImageViewer target={{ title: 'Edición', coverUrl: 'https://x/p.jpg' }} onClose={onClose} />);

    expect(mockDetails).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Cerrar imagen'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CatalogProductThumb', () => {
  it('con imagen y onPress se abre al tocarla; sin imagen no es pulsable', () => {
    const onPress = jest.fn();
    const screen = render(<CatalogProductThumb uri="https://x/a.jpg" accessibilityLabel="Silla" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Ver foto de Silla'));
    expect(onPress).toHaveBeenCalled();

    const empty = render(<CatalogProductThumb uri={null} accessibilityLabel="Mesa" onPress={onPress} />);
    expect(empty.queryByLabelText('Ver foto de Mesa')).toBeNull();
  });
});
