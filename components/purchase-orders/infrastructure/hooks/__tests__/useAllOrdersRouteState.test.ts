import { act, renderHook } from '@testing-library/react-native';
import { useAllOrdersRouteState } from '../useAllOrdersRouteState';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

describe('useAllOrdersRouteState', () => {
  beforeEach(() => {
    mockParams = {};
  });

  it('sin parámetros abre Entrega con el buscador vacío', () => {
    const { result } = renderHook(() => useAllOrdersRouteState());
    expect(result.current.activeTab).toBe('delivery');
    expect(result.current.searchQuery).toBe('');
  });

  it('una segunda notificación con la pantalla ya abierta cambia pestaña y búsqueda', () => {
    mockParams = { tab: 'delivery', q: 'OE-1', n: 'a' };
    const { result, rerender } = renderHook(() => useAllOrdersRouteState());
    expect(result.current.searchQuery).toBe('OE-1');

    mockParams = { tab: 'purchase', q: 'OC-7', n: 'b' };
    rerender({});
    expect(result.current.activeTab).toBe('purchase');
    expect(result.current.searchQuery).toBe('OC-7');
  });

  it('el mismo aviso tocado otra vez reaplica la búsqueda aunque el usuario la haya cambiado', () => {
    mockParams = { tab: 'delivery', q: 'OE-1', n: 'a' };
    const { result, rerender } = renderHook(() => useAllOrdersRouteState());
    act(() => result.current.setSearchQuery('otra cosa'));

    mockParams = { tab: 'delivery', q: 'OE-1', n: 'b' };
    rerender({});
    expect(result.current.searchQuery).toBe('OE-1');
  });
});
