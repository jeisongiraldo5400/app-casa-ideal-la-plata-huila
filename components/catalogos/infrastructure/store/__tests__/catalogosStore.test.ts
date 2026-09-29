import type { PrivateCatalogListItem } from '@/lib/catalogos/types';
import { loadFullCategoryPreviews } from '../../services/catalogDetailService';
import { listPrivateCatalogs } from '../../services/catalogsService';
import type { CatalogDetailEntry } from '../catalogosStore';
import { useCatalogosStore } from '../catalogosStore';

jest.mock('../../services/catalogsService', () => ({
  currentUserId: jest.fn(async () => 'user-1'),
  listPrivateCatalogs: jest.fn(),
}));
jest.mock('../../services/catalogDetailService', () => ({ loadCatalogDetailBundle: jest.fn(), loadFullCategoryPreviews: jest.fn() }));

const mockedList = listPrivateCatalogs as jest.MockedFunction<typeof listPrivateCatalogs>;

function item(id: string): PrivateCatalogListItem {
  return { id } as PrivateCatalogListItem;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  useCatalogosStore.setState({ list: [], listStamp: null, loading: false, error: null, details: {} });
});

describe('useCatalogosStore.fetchList', () => {
  it('dos enfoques simultáneos comparten la misma petición', async () => {
    mockedList.mockResolvedValue([item('a')]);
    const { fetchList } = useCatalogosStore.getState();

    await Promise.all([fetchList(), fetchList()]);

    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(useCatalogosStore.getState().list).toEqual([item('a')]);
    expect(useCatalogosStore.getState().loading).toBe(false);
  });

  it('una respuesta vieja no pisa a una recarga forzada más nueva', async () => {
    const slow = deferred<PrivateCatalogListItem[]>();
    mockedList.mockImplementationOnce(() => slow.promise).mockResolvedValueOnce([item('nuevo')]);
    const { fetchList } = useCatalogosStore.getState();

    const first = fetchList();
    await fetchList({ force: true });
    slow.resolve([item('viejo')]);
    await first;

    expect(useCatalogosStore.getState().list).toEqual([item('nuevo')]);
    expect(useCatalogosStore.getState().loading).toBe(false);
  });

  it('una mutación durante la carga deja la lista marcada para recargar', async () => {
    const slow = deferred<PrivateCatalogListItem[]>();
    mockedList.mockImplementationOnce(() => slow.promise);
    const request = useCatalogosStore.getState().fetchList();

    // `listStamp` aún es null: sin el contador, la invalidación se perdería.
    useCatalogosStore.getState().invalidateCatalog('a');
    slow.resolve([item('a')]);
    await request;

    expect(useCatalogosStore.getState().listStamp?.stale).toBe(true);
  });

  it('sin mutaciones la lista queda fresca y no se vuelve a pedir', async () => {
    mockedList.mockResolvedValue([item('a')]);
    await useCatalogosStore.getState().fetchList();
    await useCatalogosStore.getState().fetchList();

    expect(useCatalogosStore.getState().listStamp?.stale).toBe(false);
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('un catálogo archivado durante la carga no reaparece', async () => {
    const slow = deferred<PrivateCatalogListItem[]>();
    mockedList.mockImplementationOnce(() => slow.promise);
    const request = useCatalogosStore.getState().fetchList();

    useCatalogosStore.getState().removeFromList('archivado');
    slow.resolve([item('archivado'), item('b')]);
    await request;

    expect(useCatalogosStore.getState().list).toEqual([item('b')]);
  });

  it('un fallo conserva la lista anterior', async () => {
    mockedList.mockResolvedValueOnce([item('a')]).mockRejectedValueOnce(new Error('Network request failed'));
    await useCatalogosStore.getState().fetchList();
    await useCatalogosStore.getState().fetchList({ force: true });

    expect(useCatalogosStore.getState().list).toEqual([item('a')]);
    expect(useCatalogosStore.getState().error).toBeTruthy();
  });
});

describe('useCatalogosStore.loadFullCategories', () => {
  const mockedFull = loadFullCategoryPreviews as jest.MockedFunction<typeof loadFullCategoryPreviews>;

  it('completa las categorías del detalle cacheado sin marcarlo para recargar', async () => {
    const sample = { items: [], totalCount: 30 };
    const full = { items: [{ productId: 'p-1' }], totalCount: 1 } as never;
    const entry = { detail: { id: 'c-1' }, products: new Map(), categories: new Map([['cat-a', sample], ['cat-b', sample]]), ownerName: null, loadedAt: 1, stale: false } as unknown as CatalogDetailEntry;
    useCatalogosStore.setState({ details: { 'c-1': entry } });
    mockedFull.mockResolvedValue(new Map([['cat-a', full]]));

    await useCatalogosStore.getState().loadFullCategories('c-1', ['cat-a']);

    const after = useCatalogosStore.getState().details['c-1'];
    expect(mockedFull).toHaveBeenCalledWith(['cat-a']);
    expect(after.categories.get('cat-a')).toBe(full);
    expect(after.categories.get('cat-b')).toBe(sample);
    expect(after.stale).toBe(false);
  });

  it('no resucita un detalle que ya no está en caché', async () => {
    mockedFull.mockResolvedValue(new Map());
    await useCatalogosStore.getState().loadFullCategories('c-9', ['cat-a']);
    expect(useCatalogosStore.getState().details['c-9']).toBeUndefined();
  });
});
