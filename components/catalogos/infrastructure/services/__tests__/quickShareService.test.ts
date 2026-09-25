import { shareSingleProduct } from '../quickShareService';
import { createPrivateCatalog, currentUserId, getPrivateCatalog } from '../catalogsService';
import { toggleCatalogProduct } from '../catalogItemsService';
import { buildCatalogSnapshot } from '../catalogSnapshotService';
import { createCatalogShareLink } from '../catalogShareLinksService';
import { generateShareToken } from '../shareTokenService';

const mockLimit = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      const builder: Record<string, unknown> = {};
      ['select', 'eq', 'is', 'order'].forEach((method) => {
        builder[method] = jest.fn(() => builder);
      });
      builder.limit = (...args: unknown[]) => mockLimit(...args);
      return builder;
    }),
  },
}));
jest.mock('../catalogsService', () => ({
  createPrivateCatalog: jest.fn(),
  currentUserId: jest.fn(),
  getPrivateCatalog: jest.fn(),
}));
jest.mock('../catalogItemsService', () => ({ toggleCatalogProduct: jest.fn() }));
jest.mock('../catalogSnapshotService', () => ({ buildCatalogSnapshot: jest.fn() }));
jest.mock('../catalogShareLinksService', () => ({ createCatalogShareLink: jest.fn() }));
jest.mock('../shareTokenService', () => ({ generateShareToken: jest.fn() }));
jest.mock('@/lib/catalogos/shareLinks', () => ({
  buildMagazineUrl: (token: string) => `https://catalogo.test/c/${token}`,
  expiresAtFromHours: () => '2026-10-01T00:00:00.000Z',
}));

function edicion(id: string, productIds: string[]) {
  return {
    id,
    publicTitle: 'Nevera 250',
    sections: [
      {
        id: `sec-${id}`,
        items: productIds.map((productId) => ({ itemType: 'product', referenceId: productId })),
      },
    ],
    shareLinks: [],
  };
}

const entrada = { productId: 'prod-1', productName: 'Nevera 250', label: 'Nancy', hours: 168 };

// Pedido del usuario (2026-09-24): 4 de cada 5 ediciones tenían un solo
// producto. «Enviar un producto» lo hace en un paso.
describe('shareSingleProduct', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (currentUserId as jest.Mock).mockResolvedValue('vendedor-1');
    (buildCatalogSnapshot as jest.Mock).mockResolvedValue({ snapshot: true });
    (generateShareToken as jest.Mock).mockResolvedValue({ token: 'tok', tokenHash: 'h', tokenHint: 'tk' });
    (createCatalogShareLink as jest.Mock).mockResolvedValue({ expiresAt: '2026-10-01T00:00:00.000Z' });
  });

  it('la primera vez crea una edición con solo ese producto y la comparte', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    (createPrivateCatalog as jest.Mock).mockResolvedValue({ id: 'cat-nuevo' });
    (getPrivateCatalog as jest.Mock).mockResolvedValue(edicion('cat-nuevo', ['prod-1']));

    const result = await shareSingleProduct(entrada);

    expect(createPrivateCatalog).toHaveBeenCalledWith({
      internalTitle: 'Envío rápido · Nevera 250',
      publicTitle: 'Nevera 250',
    });
    expect(toggleCatalogProduct).toHaveBeenCalledWith('cat-nuevo', 'prod-1', true, []);
    expect(createCatalogShareLink).toHaveBeenCalledWith(
      expect.objectContaining({ catalogId: 'cat-nuevo', label: 'Nancy', tokenHash: 'h' }),
    );
    expect(result.url).toBe('https://catalogo.test/c/tok');
  });

  // Mandar el mismo producto a otro cliente no crea otra edición igual: la
  // lista del vendedor se llenaría de copias.
  it('si ya envió ese producto, reutiliza la edición y solo crea un enlace nuevo', async () => {
    mockLimit.mockResolvedValue({ data: [{ id: 'cat-previo' }], error: null });
    (getPrivateCatalog as jest.Mock).mockResolvedValue(edicion('cat-previo', ['prod-1']));

    await shareSingleProduct(entrada);

    expect(createPrivateCatalog).not.toHaveBeenCalled();
    expect(toggleCatalogProduct).not.toHaveBeenCalled();
    expect(createCatalogShareLink).toHaveBeenCalledWith(expect.objectContaining({ catalogId: 'cat-previo' }));
  });

  // Si alguien editó esa edición y le añadió otros productos, reutilizarla
  // mandaría al cliente algo distinto de lo que se eligió.
  it('no reutiliza una edición a la que le añadieron otros productos', async () => {
    mockLimit.mockResolvedValue({ data: [{ id: 'cat-editado' }], error: null });
    (getPrivateCatalog as jest.Mock)
      .mockResolvedValueOnce(edicion('cat-editado', ['prod-1', 'prod-2']))
      .mockResolvedValueOnce(edicion('cat-nuevo', ['prod-1']));
    (createPrivateCatalog as jest.Mock).mockResolvedValue({ id: 'cat-nuevo' });

    await shareSingleProduct(entrada);

    expect(createPrivateCatalog).toHaveBeenCalled();
    expect(createCatalogShareLink).toHaveBeenCalledWith(expect.objectContaining({ catalogId: 'cat-nuevo' }));
  });

  it('si la búsqueda del envío anterior falla, lo dice en vez de duplicar a ciegas', async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: 'sin red' } });

    await expect(shareSingleProduct(entrada)).rejects.toThrow(/envío anterior/);
    expect(createPrivateCatalog).not.toHaveBeenCalled();
  });
});
