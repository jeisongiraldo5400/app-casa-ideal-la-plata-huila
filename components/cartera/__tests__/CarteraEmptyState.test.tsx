import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { getColors } from '@/constants/theme';
import { CarteraEmptyState } from '../CarteraEmptyState';

jest.mock('@/components/offline', () => ({ DownloadDataButton: () => null }));

const colors = getColors(false);
const base = { loading: false, searchOnly: false, search: '', activeCount: 0, fromCache: false, colors };

describe('CarteraEmptyState', () => {
  it('si la carga falló lo dice y ofrece reintentar (no «Sin cuotas»)', () => {
    const onRetry = jest.fn();
    const screen = render(<CarteraEmptyState {...base} error="La red no respondió a tiempo." onRetry={onRetry} />);
    expect(screen.getByText('No se pudo cargar la cartera')).toBeTruthy();
    expect(screen.getByText('La red no respondió a tiempo.')).toBeTruthy();
    expect(screen.queryByText(/Sin cuotas/)).toBeNull();
    fireEvent.press(screen.getByText('Reintentar'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('sin error sigue diciendo que no hay cuotas', () => {
    const screen = render(<CarteraEmptyState {...base} />);
    expect(screen.getByText('Sin cuotas para estos filtros')).toBeTruthy();
  });
});
