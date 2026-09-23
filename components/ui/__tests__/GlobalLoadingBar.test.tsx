import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { GlobalLoadingBar } from '../GlobalLoadingBar';
import { LOADING_SHOW_DELAY_MS, useLoadingStore } from '@/lib/ui/loadingStore';

jest.mock('@/components/theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// Ruta controlable: así se puede simular que el destino ya montó.
let mockPathname = '/(tabs)/index';
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
}));

describe('GlobalLoadingBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPathname = '/(tabs)/index';
    useLoadingStore.getState().reset();
  });

  afterEach(() => {
    act(() => useLoadingStore.getState().reset());
    jest.useRealTimers();
  });

  it('no pinta nada cuando la app no está ocupada', () => {
    render(<GlobalLoadingBar />);
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('no aparece si la carga dura menos que el umbral', () => {
    render(<GlobalLoadingBar />);

    act(() => {
      useLoadingStore.getState().setScreenLoading('cartera', true);
    });
    act(() => {
      jest.advanceTimersByTime(LOADING_SHOW_DELAY_MS - 60);
      useLoadingStore.getState().setScreenLoading('cartera', false);
    });
    act(() => {
      jest.advanceTimersByTime(LOADING_SHOW_DELAY_MS);
    });

    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('aparece cuando la carga se alarga y se apaga al terminar', () => {
    render(<GlobalLoadingBar />);

    act(() => {
      useLoadingStore.getState().setScreenLoading('cartera', true);
    });
    act(() => {
      jest.advanceTimersByTime(LOADING_SHOW_DELAY_MS);
    });
    expect(screen.getByText('Cargando…')).toBeTruthy();

    act(() => {
      useLoadingStore.getState().setScreenLoading('cartera', false);
    });
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('avisa también durante la navegación, antes de que el destino cargue', () => {
    render(<GlobalLoadingBar />);
    // Deja correr el efecto de montaje (cierra el tramo de la ruta inicial)
    // antes de simular el toque en el menú.
    act(() => {
      jest.advanceTimersByTime(1);
    });

    act(() => {
      useLoadingStore.getState().startNavigation();
    });
    act(() => {
      jest.advanceTimersByTime(LOADING_SHOW_DELAY_MS);
    });

    expect(screen.getByText('Cargando…')).toBeTruthy();
  });

  it('cierra el tramo de navegación cuando la ruta destino ya montó', () => {
    const view = render(<GlobalLoadingBar />);

    act(() => {
      useLoadingStore.getState().startNavigation();
    });
    expect(useLoadingStore.getState().navigating).toBe(true);

    // La ruta cambió: el destino ya está montado y, si pidiera datos, habría
    // registrado su propio indicador. Sin nadie cargando, el aviso se apaga.
    mockPathname = '/(tabs)/cartera';
    act(() => {
      view.rerender(<GlobalLoadingBar />);
      jest.advanceTimersByTime(LOADING_SHOW_DELAY_MS);
    });

    expect(useLoadingStore.getState().navigating).toBe(false);
    expect(screen.queryByText('Cargando…')).toBeNull();
  });
});
