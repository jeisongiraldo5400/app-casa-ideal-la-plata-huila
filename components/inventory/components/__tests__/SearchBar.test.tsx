import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SearchBar } from '../SearchBar';
import { useInventoryStore } from '@/components/inventory/infrastructure/store/inventoryStore';

// El buscador es lo único que se prueba aquí: el store real solo aporta
// setSearchQuery y searchQuery.
jest.mock('@/components/inventory/infrastructure/store/inventoryStore', () => ({
  useInventoryStore: jest.fn(),
}));

const mockStore = useInventoryStore as unknown as jest.Mock;

function conStore(searchQuery: string, setSearchQuery: jest.Mock) {
  const state = { searchQuery, setSearchQuery };
  mockStore.mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
}

describe('SearchBar de productos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Reportado por el usuario (2026-09-23): «cuando escribo se borra o no me
  // deja escribir más porque está buscando».
  it('no consulta por cada tecla: espera a que el usuario termine', () => {
    const setSearchQuery = jest.fn();
    conStore('', setSearchQuery);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Buscar por nombre, SKU o código');

    fireEvent.changeText(input, 's');
    fireEvent.changeText(input, 'si');
    fireEvent.changeText(input, 'sil');
    act(() => jest.advanceTimersByTime(349));
    expect(setSearchQuery).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(setSearchQuery).toHaveBeenCalledTimes(1);
    expect(setSearchQuery).toHaveBeenCalledWith('sil');
  });

  it('lo escrito se ve mientras tanto, aunque el store siga vacío', () => {
    const setSearchQuery = jest.fn();
    conStore('', setSearchQuery);
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Buscar por nombre, SKU o código');

    fireEvent.changeText(input, 'silla');

    expect(input.props.value).toBe('silla');
  });

  it('sigue al store cuando el término cambia por fuera', () => {
    const setSearchQuery = jest.fn();
    conStore('', setSearchQuery);
    const view = render(<SearchBar />);

    conStore('nevera', setSearchQuery);
    view.rerender(<SearchBar />);

    expect(screen.getByPlaceholderText('Buscar por nombre, SKU o código').props.value).toBe('nevera');
  });
});
