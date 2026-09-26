import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { useExitsListStore } from '../../infrastructure/store/exitsListStore';
import { EXITS_SEARCH_DEBOUNCE_MS, ExitsSearchBar } from '../ExitsSearchBar';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/components/theme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));

describe('ExitsSearchBar', () => {
  const searchExits = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.useFakeTimers();
    searchExits.mockClear();
    useExitsListStore.setState({ searchQuery: '', searchExits });
  });

  afterEach(() => jest.useRealTimers());

  it('espera a que se deje de escribir y consulta una sola vez', () => {
    render(<ExitsSearchBar />);
    const input = screen.getByPlaceholderText('Buscar producto, SKU, código o serial');

    fireEvent.changeText(input, 'ne');
    fireEvent.changeText(input, 'neve');
    fireEvent.changeText(input, 'nevera ');
    expect(searchExits).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(EXITS_SEARCH_DEBOUNCE_MS);
    });
    expect(searchExits).toHaveBeenCalledTimes(1);
    expect(searchExits).toHaveBeenCalledWith('nevera');
  });

  it('limpiar la búsqueda recarga de inmediato', () => {
    render(<ExitsSearchBar />);
    fireEvent.changeText(screen.getByPlaceholderText('Buscar producto, SKU, código o serial'), '');
    expect(searchExits).toHaveBeenCalledWith('');
  });
});
