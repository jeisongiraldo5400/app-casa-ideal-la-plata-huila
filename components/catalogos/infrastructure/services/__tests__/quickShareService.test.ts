import { shareProducts, shareSingleProduct } from '../quickShareService';
import { archiveOwnCatalog, createPrivateCatalog, currentUserId, getPrivateCatalog } from '../catalogsService';
import { addCatalogProducts, toggleCatalogProduct } from '../catalogItemsService';
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
  archiveOwnCatalog: jest.fn(),
  createPrivateCatalog: jest.fn(),
  currentUserId: jest.fn(),
  getPrivateCatalog: jest.fn(),
}));
jest.mock('../catalogItemsService', () => ({ addCatalogProducts: jest.fn(), toggleCatalogProduct: jest.fn() }));
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

function ficha(productId: string, displayName: string) {
  return {
    catalogProductId: `cp-${productId}`,
    productId,
    slug: productId,
    displayName,
    shortDescription: null,
    stockQuantity: 3,
    categoryId: null,
    categoryName: null,
    brandName: null,
    isFeatured: false,
    coverImageUrl: null,
    publishedAt: null,
  };
}

// Pedido del usuario (2026-09-29): elegir varios productos y mandarlos juntos.
describe('shareProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (currentUserId as jest.Mock).mockResolvedValue('vendedor-1');
    (buildCatalogSnapshot as jest.Mock).mockResolvedValue({ snapshot: true });
    (generateShareToken as jest.Mock).mockResolvedValue({ token: 'tok', tokenHash: 'h', tokenHint: 'tk' });
    (createCatalogShareLink as jest.Mock).mockResolvedValue({ expiresAt: '2026-10-01T00:00:00.000Z' });
    (archiveOwnCatalog as jest.Mock).mockResolvedValue(undefined);
  });

  it('con uno solo hace exactamente lo de siempre (edición de un producto)', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    (createPrivateCatalog as jest.Mock).mockResolvedValue({ id: 'cat-uno' });
    (getPrivateCatalog as jest.Mock).mockResolvedValue(edicion('cat-uno', ['prod-1']));

    await shareProducts({ products: [ficha('prod-1', 'Nevera 250')], label: 'Nancy', hours: 168 });

    expect(createPrivateCatalog).toHaveBeenCalledWith({ internalTitle: 'Envío rápido · Nevera 250', publicTitle: 'Nevera 250' });
    expect(toggleCatalogProduct).toHaveBeenCalledWith('cat-uno', 'prod-1', true, []);
    expect(addCatalogProducts).not.toHaveBeenCalled();
  });

  it('con varios crea UNA edición con todos, por lote, y un solo enlace', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    (createPrivateCatalog as jest.Mock).mockResolvedValue({ id: 'cat-varios' });
    (getPrivateCatalog as jest.Mock).mockResolvedValue(edicion('cat-varios', ['prod-1', 'prod-2', 'prod-3']));
    const productos = [ficha('prod-1', 'Nevera'), ficha('prod-2', 'Sofá'), ficha('prod-3', 'Mesa')];

    const result = await shareProducts({ products: productos, label: 'Nancy', hours: 168 });

    expect(createPrivateCatalog).toHaveBeenCalledTimes(1);
    expect(createPrivateCatalog).toHaveBeenCalledWith({
      internalTitle: 'Envío rápido · 3 productos: Nevera, Sofá y 1 más',
      publicTitle: 'Nevera, Sofá y 1 más',
    });
    expect(addCatalogProducts).toHaveBeenCalledWith('cat-varios', ['prod-1', 'prod-2', 'prod-3'], []);
    expect(toggleCatalogProduct).not.toHaveBeenCalled();
    expect(createCatalogShareLink).toHaveBeenCalledTimes(1);
    // Las fichas ya cargadas se pasan al snapshot para no volver a pedirlas.
    const options = (buildCatalogSnapshot as jest.Mock).mock.calls[0][1];
    expect([...options.known.products.keys()]).toEqual(['prod-1', 'prod-2', 'prod-3']);
    expect(result.url).toBe('https://catalogo.test/c/tok');
  });

  it('el mismo conjunto reutiliza la edición anterior y solo crea otro enlace', async () => {
    mockLimit.mockResolvedValue({ data: [{ id: 'cat-previo' }], error: null });
    (getPrivateCatalog as jest.Mock).mockResolvedValue(edicion('cat-previo', ['prod-2', 'prod-1']));

    await shareProducts({ products: [ficha('prod-1', 'Nevera'), ficha('prod-2', 'Sofá')], label: '', hours: 24 });

    expect(createPrivateCatalog).not.toHaveBeenCalled();
    expect(addCatalogProducts).not.toHaveBeenCalled();
    expect(createCatalogShareLink).toHaveBeenCalledWith(expect.objectContaining({ catalogId: 'cat-previo' }));
  });

  it('si falla el alta de productos, archiva la edición vacía y avisa', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    (createPrivateCatalog as jest.Mock).mockResolvedValue({ id: 'cat-roto' });
    (addCatalogProducts as jest.Mock).mockRejectedValueOnce(new Error('No fue posible añadir los productos: x'));

    await expect(
      shareProducts({ products: [ficha('prod-1', 'Nevera'), ficha('prod-2', 'Sofá')], label: '', hours: 24 })
    ).rejects.toThrow(/añadir los productos/);
    expect(archiveOwnCatalog).toHaveBeenCalledWith('cat-roto');
    expect(createCatalogShareLink).not.toHaveBeenCalled();
  });

  it('respeta el tope y no acepta una selección vacía', async () => {
    const muchos = Array.from({ length: 31 }, (_, index) => ficha(`p-${index}`, `P ${index}`));
    await expect(shareProducts({ products: muchos, label: '', hours: 24 })).rejects.toThrow(/hasta 30/);
    await expect(shareProducts({ products: [], label: '', hours: 24 })).rejects.toThrow(/al menos un producto/);
    expect(createPrivateCatalog).not.toHaveBeenCalled();
  });
});
