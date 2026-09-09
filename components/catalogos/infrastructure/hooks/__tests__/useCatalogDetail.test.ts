import { renderHook, waitFor } from '@testing-library/react-native';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { getPrivateCatalog } from '../../services/catalogsService';
import { listPublicCatalogProductsByIds } from '../../services/publicCatalogService';
import { useCatalogDetail } from '../useCatalogDetail';

jest.mock('../../services/catalogsService', () => ({ getPrivateCatalog: jest.fn() }));
jest.mock('../../services/publicCatalogService', () => ({ listPublicCatalogProductsByIds: jest.fn() }));
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
});
