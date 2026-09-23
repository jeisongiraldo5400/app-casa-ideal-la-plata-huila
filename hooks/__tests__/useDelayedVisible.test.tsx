import { act, renderHook } from '@testing-library/react-native';
import { useDelayedVisible } from '../useDelayedVisible';

const DELAY = 200;

describe('useDelayedVisible', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('no muestra nada mientras no haya carga', () => {
    const { result } = renderHook(() => useDelayedVisible(false, DELAY));
    expect(result.current).toBe(false);
  });

  it('no parpadea en cargas más cortas que el umbral', () => {
    const { result, rerender } = renderHook<boolean, { active: boolean }>(({ active }) => useDelayedVisible(active, DELAY), {
      initialProps: { active: true },
    });

    // La carga termina a los 120 ms: el aviso nunca llegó a encenderse.
    act(() => {
      jest.advanceTimersByTime(120);
    });
    expect(result.current).toBe(false);

    rerender({ active: false });
    act(() => {
      jest.advanceTimersByTime(DELAY);
    });
    expect(result.current).toBe(false);
  });

  it('se enciende cuando la espera supera el umbral', () => {
    const { result } = renderHook(() => useDelayedVisible(true, DELAY));

    act(() => {
      jest.advanceTimersByTime(DELAY);
    });
    expect(result.current).toBe(true);
  });

  it('se apaga de inmediato al terminar la carga, sin esperar el umbral', () => {
    const { result, rerender } = renderHook<boolean, { active: boolean }>(({ active }) => useDelayedVisible(active, DELAY), {
      initialProps: { active: true },
    });

    act(() => {
      jest.advanceTimersByTime(DELAY);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);
  });
});
