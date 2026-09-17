import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { getPrivateCatalog } from '../../services/catalogsService';
import { listPublicCatalogProductsByIds } from '../../services/publicCatalogService';
import { useCatalogosStore } from '../../store/catalogosStore';
import { useCatalogDetail } from '../useCatalogDetail';

jest.mock('../../services/catalogsService', () => ({ getPrivateCatalog: jest.fn() }));
jest.mock('../../services/publicCatalogService', () => ({
  listPublicCatalogProductsByIds: jest.fn(),
  listPublicCatalogCategoryPreview: jest.fn(async () => ({ items: [], totalCount: 12 })),
}));
jest.mock('@/lib/profileNames', () => ({ fetchProfileNames: jest.fn(async () => new Map()) }));
// El de verdad corre como efecto, no durante el render: si se invoca en el
// render, el primer setState llega antes de que el hook esté montado.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));

const mockedGet = getPrivateCatalog as jest.MockedFunction<typeof getPrivateCatalog>;
const mockedProducts = listPublicCatalogProductsByIds as jest.MockedFunction<typeof listPublicCatalogProductsByIds>;

// El prefijo `mock` es lo que deja a jest.mock() referenciarlas pese al hoisting.
let mockViewerId = 'vendedor-1';
let mockCanCreateShareLink = true;

jest.mock('@/components/auth/infrastructure/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: mockViewerId } }),
}));
jest.mock('../useCatalogAccess', () => ({
  useCatalogAccess: () => ({
    canAccessCatalogs: true,
    canManageCatalog: true,
    canCreateShareLink: mockCanCreateShareLink,
    loading: false,
  }),
}));

function detail(ownerId: string): PrivateCatalogDetail {
  return {
    id: 'cat-1',
    ownerId,
    internalTitle: 'Temporada alta',
    publicTitle: 'Temporada alta',
    introduction: null,
    coverImageUrl: null,
    accentColor: '#1e3a8a',
    template: 'editorial',
    status: 'published',
    visibility: 'organization',
    showPrice: false,
    showAvailability: false,
    showSku: false,
    showContact: true,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    sections: [],
    shareLinks: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // La caché del detalle es global: cada prueba empieza sin datos.
  useCatalogosStore.setState({ details: {}, list: [], listStamp: null });
  mockViewerId = 'vendedor-1';
  mockCanCreateShareLink = true;
  mockedProducts.mockResolvedValue([]);
});

describe('useCatalogDetail', () => {
  it('marca canShare en un catálogo ajeno: el vendedor entrega sus propios enlaces', async () => {
    mockedGet.mockResolvedValue(detail('admin-9'));

    const { result } = renderHook(() => useCatalogDetail('cat-1'));

    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(result.current.isOwner).toBe(false);
    expect(result.current.canShare).toBe(true);
  });

  it('sin permiso de compartir no puede entregar enlaces ni siendo suyo', async () => {
    mockCanCreateShareLink = false;
    mockedGet.mockResolvedValue(detail('vendedor-1'));

    const { result } = renderHook(() => useCatalogDetail('cat-1'));

    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(result.current.isOwner).toBe(true);
    expect(result.current.canShare).toBe(false);
  });

  it('no hay nada que compartir mientras el catálogo no cargue', async () => {
    mockedGet.mockResolvedValue(null);

    const { result } = renderHook(() => useCatalogDetail('cat-1'));

    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.canShare).toBe(false);
  });

  it('marca el fallo de red y lo limpia al recargar con éxito', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network request failed'));
    const { result } = renderHook(() => useCatalogDetail('cat-1'));

    await waitFor(() => expect(result.current.isNetworkFailure).toBe(true));
    expect(result.current.error).toBeTruthy();

    mockedGet.mockResolvedValueOnce(detail('vendedor-1'));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.isNetworkFailure).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.detail).not.toBeNull();
  });

  it('un error que no es de red no se presenta como «Sin conexión»', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network request failed'));
    const { result } = renderHook(() => useCatalogDetail('cat-1'));
    await waitFor(() => expect(result.current.isNetworkFailure).toBe(true));

    mockedGet.mockRejectedValueOnce(new Error('permiso denegado'));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.isNetworkFailure).toBe(false);
    expect(result.current.error).toContain('permiso denegado');
  });

  it('reutiliza el detalle en caché al volver a otra pantalla del mismo catálogo', async () => {
    mockedGet.mockResolvedValue(detail('vendedor-1'));
    const first = renderHook(() => useCatalogDetail('cat-1'));
    await waitFor(() => expect(first.result.current.detail).not.toBeNull());

    const second = renderHook(() => useCatalogDetail('cat-1'));
    expect(second.result.current.detail).not.toBeNull();
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('recarga tras una mutación aunque no hayan pasado 30 s', async () => {
    mockedGet.mockResolvedValue(detail('vendedor-1'));
    const first = renderHook(() => useCatalogDetail('cat-1'));
    await waitFor(() => expect(first.result.current.detail).not.toBeNull());

    act(() => useCatalogosStore.getState().invalidateCatalog('cat-1'));
    const second = renderHook(() => useCatalogDetail('cat-1'));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
  });

  it('recarga si el catálogo se invalida mientras la pantalla está enfocada', async () => {
    mockedGet.mockResolvedValue(detail('vendedor-1'));
    const { result } = renderHook(() => useCatalogDetail('cat-1'));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(mockedGet).toHaveBeenCalledTimes(1);

    // P. ej. termina una escritura que empezó en Productos.
    act(() => useCatalogosStore.getState().invalidateCatalog('cat-1'));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useCatalogosStore.getState().details['cat-1']?.stale).toBe(false));
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('con refreshWhenStale apagado no recarga por una invalidación', async () => {
    mockedGet.mockResolvedValue(detail('vendedor-1'));
    const { result } = renderHook(() => useCatalogDetail('cat-1', { refreshWhenStale: false }));
    await waitFor(() => expect(result.current.detail).not.toBeNull());

    act(() => useCatalogosStore.getState().invalidateCatalog('cat-1'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('una carga descartada por una invalidación no marca el catálogo como inexistente', async () => {
    let resolveFirst: (value: PrivateCatalogDetail) => void = () => undefined;
    mockedGet.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    mockedGet.mockResolvedValue(detail('vendedor-1'));
    const { result } = renderHook(() => useCatalogDetail('cat-1', { refreshWhenStale: false }));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

    // Sin caché todavía: la carga en curso queda descartada.
    act(() => useCatalogosStore.getState().invalidateCatalog('cat-1'));
    await act(async () => {
      resolveFirst(detail('vendedor-1'));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(false);
    expect(result.current.detail).not.toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('de las categorías completas solo pide la muestra de miniaturas y su total', async () => {
    const withCategory = detail('vendedor-1');
    withCategory.sections = [
      { id: 's-1', title: 'Sala', kicker: null, body: null, imageUrl: null, sortOrder: 0, items: [{ id: 'i-1', itemType: 'category', referenceId: 'cat-sala', isFeatured: false, sortOrder: 0 }] },
    ];
    mockedGet.mockResolvedValue(withCategory);
    const { result } = renderHook(() => useCatalogDetail('cat-1'));

    await waitFor(() => expect(result.current.categories.get('cat-sala')?.totalCount).toBe(12));
    const { listPublicCatalogCategoryPreview } = jest.requireMock('../../services/publicCatalogService');
    expect(listPublicCatalogCategoryPreview).toHaveBeenCalledWith('cat-sala', 8);
  });
});
