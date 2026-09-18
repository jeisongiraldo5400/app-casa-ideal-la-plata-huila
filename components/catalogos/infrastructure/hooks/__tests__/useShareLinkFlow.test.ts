import { act, renderHook } from '@testing-library/react-native';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { previewReadiness, useShareLinkFlow } from '../useShareLinkFlow';

const mockBuildSnapshot = jest.fn();
const mockCreateLink = jest.fn();
const mockReissueLink = jest.fn();
const mockWhatsApp = jest.fn();
const mockInvalidate = jest.fn();
const mockGetCatalog = jest.fn();
const mockWaitForDismissal = jest.fn();

jest.mock('../../services/catalogSnapshotService', () => ({ buildCatalogSnapshot: (...args: unknown[]) => mockBuildSnapshot(...args) }));
jest.mock('../../services/catalogShareLinksService', () => ({
  createCatalogShareLink: (...args: unknown[]) => mockCreateLink(...args),
  reissueCatalogShareLink: (...args: unknown[]) => mockReissueLink(...args),
}));
jest.mock('../../services/shareTokenService', () => ({
  generateShareToken: async () => ({ token: 'tok', tokenHash: 'a'.repeat(64), tokenHint: 'hint' }),
}));
jest.mock('../../../utils/shareActions', () => ({ shareLinkByWhatsApp: (...args: unknown[]) => mockWhatsApp(...args) }));
jest.mock('../../store/catalogosStore', () => ({ invalidateCatalogCache: (...args: unknown[]) => mockInvalidate(...args) }));
jest.mock('../../services/catalogsService', () => ({ getPrivateCatalog: (...args: unknown[]) => mockGetCatalog(...args) }));
jest.mock('../../../utils/modalTransition', () => ({ waitForModalDismissal: () => mockWaitForDismissal() }));

const previousSite = process.env.EXPO_PUBLIC_CATALOG_SITE_URL;

function catalog(overrides: Partial<PrivateCatalogDetail> = {}): PrivateCatalogDetail {
  return {
    id: 'cat-1',
    ownerId: 'user-1',
    internalTitle: 'Interno',
    publicTitle: 'Público',
    introduction: null,
    coverImageUrl: null,
    accentColor: '#1e3a8a',
    template: 'editorial',
    status: 'draft',
    visibility: 'private',
    showPrice: false,
    showAvailability: false,
    showSku: false,
    showContact: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    sections: [],
    shareLinks: [],
    ...overrides,
  };
}

const products = new Map();
const categories = new Map();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_CATALOG_SITE_URL = 'https://catalogo.test';
  mockBuildSnapshot.mockResolvedValue({ schemaVersion: 1 });
  mockCreateLink.mockResolvedValue({ shareLinkId: 'l-1', expiresAt: '2026-09-20T00:00:00Z' });
  mockReissueLink.mockResolvedValue({ shareLinkId: 'l-2', expiresAt: '2026-09-20T00:00:00Z' });
  mockWhatsApp.mockResolvedValue('app');
  mockGetCatalog.mockImplementation(async () => catalog());
  mockWaitForDismissal.mockResolvedValue(undefined);
});

afterAll(() => {
  process.env.EXPO_PUBLIC_CATALOG_SITE_URL = previousSite;
});

function productSection(productIds: string[]) {
  return {
    id: 's-1',
    title: 'Sala',
    kicker: null,
    body: null,
    imageUrl: null,
    sortOrder: 0,
    items: productIds.map((productId, index) => ({ id: `i-${index}`, itemType: 'product' as const, referenceId: productId, isFeatured: false, sortOrder: index })),
  };
}

function listing(productId: string) {
  return { productId } as never;
}

describe('useShareLinkFlow.create', () => {
  it('abre WhatsApp con el mensaje del web y aun así deja la hoja con el enlace', async () => {
    const reload = jest.fn(async () => undefined);
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, reload));

    await act(async () => {
      await expect(result.current.create({ label: 'Ana', hours: 24, delivery: 'whatsapp' })).resolves.toBe(true);
    });

    expect(mockWhatsApp).toHaveBeenCalledWith('Hola Ana. Te comparto este catálogo de Casa Ideal: https://catalogo.test/c/tok');
    // Abrir WhatsApp no garantiza el envío: el enlace queda a mano.
    expect(result.current.result).toMatchObject({ url: 'https://catalogo.test/c/tok', whatsApp: 'app', reissued: false });
    expect(mockInvalidate).toHaveBeenCalledWith('cat-1');
    expect(reload).toHaveBeenCalled();
  });

  it('si WhatsApp no abre, la hoja lo refleja', async () => {
    mockWhatsApp.mockResolvedValueOnce('unavailable');
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await result.current.create({ label: '', hours: 24, delivery: 'whatsapp' });
    });
    expect(result.current.result).toMatchObject({ url: 'https://catalogo.test/c/tok', whatsApp: 'unavailable' });
  });

  it('«Solo generar» no abre WhatsApp y muestra la hoja', async () => {
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await result.current.create({ label: '', hours: 24, delivery: 'none' });
    });
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(result.current.result).toMatchObject({ reissued: false, url: 'https://catalogo.test/c/tok', whatsApp: null });
  });

  it('congela la selección leída al generar, no la de la caché, y solo reutiliza lo que sigue seleccionado', async () => {
    const cached = catalog({ sections: [productSection(['p-viejo', 'p-comun'])] });
    const fresh = catalog({ sections: [productSection(['p-comun', 'p-nuevo'])] });
    mockGetCatalog.mockResolvedValueOnce(fresh);
    const known = new Map([
      ['p-viejo', listing('p-viejo')],
      ['p-comun', listing('p-comun')],
    ]);
    const { result } = renderHook(() => useShareLinkFlow(cached, known, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await result.current.create({ label: '', hours: 24, delivery: 'none' });
    });

    expect(mockGetCatalog).toHaveBeenCalledWith('cat-1');
    const [snapshotDetail, options] = mockBuildSnapshot.mock.calls[0];
    expect(snapshotDetail).toBe(fresh);
    expect([...options.known.products.keys()]).toEqual(['p-comun']);
  });

  it('si el catálogo ya no existe al generar, no crea el enlace', async () => {
    mockGetCatalog.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await expect(result.current.create({ label: '', hours: 24, delivery: 'none' })).resolves.toBe(false);
    });
    expect(mockCreateLink).not.toHaveBeenCalled();
    expect(result.current.submitError).toContain('ya no está disponible');
  });
});

describe('useShareLinkFlow.reissue', () => {
  it('cierra la hoja de Reemitir y espera a que se retire antes de mostrar la URL nueva', async () => {
    const order: string[] = [];
    const onSuccess = jest.fn(() => order.push('cerrar'));
    mockWaitForDismissal.mockImplementationOnce(async () => {
      order.push('esperar');
    });
    const reload = jest.fn(async () => {
      order.push('recargar');
    });
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, reload));

    await act(async () => {
      await expect(result.current.reissue('l-1', 'Ana', 24, { onSuccess })).resolves.toBe(true);
    });

    expect(order).toEqual(['cerrar', 'esperar', 'recargar']);
    expect(result.current.result).toMatchObject({ reissued: true, url: 'https://catalogo.test/c/tok', label: 'Ana' });
  });

  it('guarda el error aparte para pintarlo dentro de la hoja', async () => {
    mockReissueLink.mockRejectedValueOnce(new Error('El enlace ya fue revocado'));
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await expect(result.current.reissue('l-1', 'Ana', 24, { onSuccess })).resolves.toBe(false);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.reissueError).toBe('El enlace ya fue revocado');
    expect(result.current.submitError).toBeNull();
    expect(result.current.result).toBeNull();

    act(() => result.current.clearReissueError());
    expect(result.current.reissueError).toBeNull();
  });
});

describe('previewReadiness', () => {
  const sectionWithCategory = {
    id: 's-1',
    title: 'Sala',
    kicker: null,
    body: null,
    imageUrl: null,
    sortOrder: 0,
    items: [{ id: 'i-1', itemType: 'category' as const, referenceId: 'cat-sala', isFeatured: false, sortOrder: 0 }],
  };

  it('usa el total de la categoría cuando ya se conoce', () => {
    const readiness = previewReadiness(catalog({ sections: [sectionWithCategory] }), new Map(), new Map([['cat-sala', { items: [], totalCount: 14 }]]));
    expect(readiness.productCount).toBe(14);
  });

  it('da por no vacía una categoría aún sin muestra', () => {
    expect(previewReadiness(catalog({ sections: [sectionWithCategory] }), new Map()).blockers).toEqual([]);
  });

  it('bloquea una categoría que se sabe vacía', () => {
    const readiness = previewReadiness(catalog({ sections: [sectionWithCategory] }), new Map(), new Map([['cat-sala', { items: [], totalCount: 0 }]]));
    expect(readiness.blockers).toHaveLength(1);
  });
});
