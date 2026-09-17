import { act, renderHook } from '@testing-library/react-native';
import type { PrivateCatalogDetail } from '@/lib/catalogos/types';
import { previewReadiness, useShareLinkFlow } from '../useShareLinkFlow';

const mockBuildSnapshot = jest.fn();
const mockCreateLink = jest.fn();
const mockReissueLink = jest.fn();
const mockWhatsApp = jest.fn();
const mockInvalidate = jest.fn();

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
  mockWhatsApp.mockResolvedValue(true);
});

afterAll(() => {
  process.env.EXPO_PUBLIC_CATALOG_SITE_URL = previousSite;
});

describe('useShareLinkFlow.create', () => {
  it('reutiliza lo cargado, abre WhatsApp con el mensaje del web y no muestra la hoja', async () => {
    const reload = jest.fn(async () => undefined);
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, reload));

    await act(async () => {
      await expect(result.current.create({ label: 'Ana', hours: 24, delivery: 'whatsapp' })).resolves.toBe(true);
    });

    expect(mockBuildSnapshot.mock.calls[0][1]).toMatchObject({ known: { products, categories } });
    expect(mockWhatsApp).toHaveBeenCalledWith('Hola Ana. Te comparto este catálogo de Casa Ideal: https://catalogo.test/c/tok');
    expect(result.current.result).toBeNull();
    expect(mockInvalidate).toHaveBeenCalledWith('cat-1');
    expect(reload).toHaveBeenCalled();
  });

  it('si WhatsApp no abre, deja la hoja para copiar el enlace', async () => {
    mockWhatsApp.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await result.current.create({ label: '', hours: 24, delivery: 'whatsapp' });
    });
    expect(result.current.result?.url).toBe('https://catalogo.test/c/tok');
  });

  it('«Solo generar» no abre WhatsApp y muestra la hoja', async () => {
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await result.current.create({ label: '', hours: 24, delivery: 'none' });
    });
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(result.current.result).toMatchObject({ reissued: false, url: 'https://catalogo.test/c/tok' });
  });
});

describe('useShareLinkFlow.reissue', () => {
  it('guarda el error aparte para pintarlo dentro de la hoja', async () => {
    mockReissueLink.mockRejectedValueOnce(new Error('El enlace ya fue revocado'));
    const { result } = renderHook(() => useShareLinkFlow(catalog(), products, categories, jest.fn(async () => undefined)));

    await act(async () => {
      await expect(result.current.reissue('l-1', 'Ana', 24)).resolves.toBe(false);
    });
    expect(result.current.reissueError).toBe('El enlace ya fue revocado');
    expect(result.current.submitError).toBeNull();

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
