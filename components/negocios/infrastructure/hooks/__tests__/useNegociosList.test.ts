import { act, renderHook, waitFor } from '@testing-library/react-native';
import { DEFAULT_NEGOCIOS_LIST_FILTERS, type NegocioListRow } from '@/lib/negocios/negociosListQuery';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { fetchNegociosFromLocal, fetchNegociosPage } from '../../services/negociosListService';
import { NEGOCIOS_PAGE_SIZE, useNegociosList, type UseNegociosListParams } from '../useNegociosList';

jest.mock('../../services/negociosListService', () => ({
  fetchNegociosPage: jest.fn(),
  fetchNegociosFromLocal: jest.fn(),
}));
jest.mock('@/lib/offline/security/sessionPolicy', () => ({ isNetworkError: jest.fn(() => false) }));
jest.mock('@/lib/errorMessage', () => ({
  errorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  logHandledError: jest.fn(),
}));

const mockPage = fetchNegociosPage as jest.Mock;
const mockLocal = fetchNegociosFromLocal as jest.Mock;
const mockIsNetwork = isNetworkError as jest.Mock;

const row = (id: string) => ({ id, numero: 1, customer: { name: id, id_number: null } }) as unknown as NegocioListRow;

const base: UseNegociosListParams = {
  scope: 'por_cobrar',
  gestorId: null,
  search: '',
  filters: DEFAULT_NEGOCIOS_LIST_FILTERS,
  userId: 'gestor-1',
  searchOnly: false,
  enabled: true,
};

describe('useNegociosList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsNetwork.mockReturnValue(false);
  });

  it('con señal pide la primera página con el alcance y los filtros', async () => {
    mockPage.mockResolvedValue({ rows: [row('a')], summary: { totalCount: 1, totalSaldo: 10, moraCount: 0 } });
    const filters = { ...DEFAULT_NEGOCIOS_LIST_FILTERS, municipioId: 'm1', cobro: 'en_mora' as const };
    const { result } = renderHook(() => useNegociosList({ ...base, filters, search: 'ana' }));
    await act(async () => {
      await result.current.reload();
    });
    expect(mockPage).toHaveBeenCalledWith({
      scope: 'por_cobrar',
      gestorId: null,
      search: 'ana',
      filters,
      limit: NEGOCIOS_PAGE_SIZE,
      offset: 0,
    });
    expect(result.current.rows.map((item) => item.id)).toEqual(['a']);
    expect(result.current.summary.totalSaldo).toBe(10);
    expect(result.current.fromCache).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('carga más páginas sin repetir filas', async () => {
    mockPage
      .mockResolvedValueOnce({ rows: [row('a'), row('b')], summary: { totalCount: 3, totalSaldo: 0, moraCount: 0 } })
      .mockResolvedValueOnce({ rows: [row('b'), row('c')], summary: { totalCount: 3, totalSaldo: 0, moraCount: 0 } });
    const { result } = renderHook(() => useNegociosList(base));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mockPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2 }));
    expect(result.current.rows.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.hasMore).toBe(false);
  });

  it('sin señal filtra la base local con los mismos parámetros', async () => {
    mockPage.mockRejectedValue(new Error('Network request failed'));
    mockIsNetwork.mockReturnValue(true);
    mockLocal.mockResolvedValue({ rows: [row('local')], summary: { totalCount: 1, totalSaldo: 5, moraCount: 1 } });
    const { result } = renderHook(() => useNegociosList({ ...base, gestorId: 'gestor-2', search: 'x' }));
    await act(async () => {
      await result.current.reload();
    });
    expect(mockLocal).toHaveBeenCalledWith({
      scope: 'por_cobrar',
      userId: 'gestor-1',
      gestorId: 'gestor-2',
      search: 'x',
      filters: DEFAULT_NEGOCIOS_LIST_FILTERS,
      searchOnly: false,
    });
    expect(result.current.fromCache).toBe(true);
    expect(result.current.summary.moraCount).toBe(1);
    // Sin señal no hay más páginas que pedir.
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mockPage).toHaveBeenCalledTimes(1);
  });

  it('un error que no es de red conserva la lista y avisa', async () => {
    mockPage
      .mockResolvedValueOnce({ rows: [row('a')], summary: { totalCount: 1, totalSaldo: 0, moraCount: 0 } })
      .mockRejectedValueOnce(new Error('Sin permiso para consultar este gestor'));
    const { result } = renderHook(() => useNegociosList(base));
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.rows.map((item) => item.id)).toEqual(['a']);
    expect(result.current.error).toBe('Sin permiso para consultar este gestor');
    expect(mockLocal).not.toHaveBeenCalled();
  });

  it('no consulta si falta el gestor o si el recaudador no ha escrito', async () => {
    const { result, rerender } = renderHook((props: UseNegociosListParams) => useNegociosList(props), {
      initialProps: { ...base, enabled: false },
    });
    await act(async () => {
      await result.current.reload();
    });
    rerender({ ...base, scope: 'todos', searchOnly: true, search: '' });
    await act(async () => {
      await result.current.reload();
    });
    expect(mockPage).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it('descarta la respuesta vieja si llegó otra consulta después', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    mockPage
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ rows: [row('nuevo')], summary: { totalCount: 1, totalSaldo: 0, moraCount: 0 } });
    const { result } = renderHook(() => useNegociosList(base));
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.reload();
    });
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      resolveFirst({ rows: [row('viejo')], summary: { totalCount: 1, totalSaldo: 0, moraCount: 0 } });
      await first;
    });
    await waitFor(() => expect(result.current.rows.map((item) => item.id)).toEqual(['nuevo']));
  });

  it('si NetInfo dice que no hay red va directo al teléfono, sin esperar al servidor', async () => {
    mockLocal.mockResolvedValue({ rows: [row('local')], summary: { totalCount: 1, totalSaldo: 0, moraCount: 0 } });
    const { result } = renderHook(() => useNegociosList({ ...base, search: 'an', online: false }));
    await act(async () => {
      await result.current.reload();
    });
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockLocal).toHaveBeenCalledWith(expect.objectContaining({ search: 'an', scope: 'por_cobrar' }));
    expect(result.current.rows.map((item) => item.id)).toEqual(['local']);
    expect(result.current.fromCache).toBe(true);
  });

  it('sin red y sin base local intenta el servidor igual', async () => {
    mockLocal.mockResolvedValue(null);
    mockPage.mockResolvedValue({ rows: [row('a')], summary: { totalCount: 1, totalSaldo: 0, moraCount: 0 } });
    const { result } = renderHook(() => useNegociosList({ ...base, online: false }));
    await act(async () => {
      await result.current.reload();
    });
    expect(mockPage).toHaveBeenCalled();
    expect(result.current.rows.map((item) => item.id)).toEqual(['a']);
  });
});
