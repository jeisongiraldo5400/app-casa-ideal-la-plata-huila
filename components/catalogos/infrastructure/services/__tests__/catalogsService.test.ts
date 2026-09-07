type Builder = Record<string, jest.Mock>;

const builders: Record<string, Builder> = {};
const mockFrom = jest.fn((table: string) => builders[table]);
const mockRpc = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getUser: () => mockGetUser() },
  },
}));

import { archiveOwnCatalog, createPrivateCatalog, getPrivateCatalog, listPrivateCatalogs, updateCatalogCoverText } from '../catalogsService';

const CATALOG_ROW = {
  id: 'cat-1',
  owner_id: 'user-1',
  internal_title: 'Lavadoras',
  public_title: 'Lavadoras Casa Ideal',
  introduction: null,
  cover_image_url: null,
  accent_color: '#1e3a8a',
  template: 'editorial',
  status: 'published',
  visibility: 'private',
  show_price: false,
  show_availability: false,
  show_sku: false,
  show_contact: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  archived_at: null,
};

function makeBuilder(result: { data: unknown; error: unknown }, terminals: string[] = []): Builder {
  const builder: Builder = {};
  for (const method of ['select', 'eq', 'is', 'order', 'insert', 'update', 'delete', 'in']) {
    builder[method] = jest.fn(() => builder);
  }
  for (const method of terminals) {
    builder[method] = jest.fn(async () => result);
  }
  // Sin terminal explícito, la propia consulta se resuelve como promesa.
  (builder as unknown as { then: unknown }).then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  builders.catalogs = makeBuilder({ data: [CATALOG_ROW], error: null }, ['maybeSingle', 'single']);
  builders.catalog_share_links = makeBuilder({ data: [], error: null });
  builders.catalog_versions = makeBuilder({ data: [], error: null });
  builders.catalog_sections = makeBuilder({ data: [], error: null });
  builders.catalog_items = makeBuilder({ data: [], error: null });
});

describe('listPrivateCatalogs', () => {
  it('pide los no archivados y deriva la propiedad de cada fila', async () => {
    const list = await listPrivateCatalogs('user-1');
    expect(builders.catalogs.is).toHaveBeenCalledWith('archived_at', null);
    expect(builders.catalogs.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(list).toHaveLength(1);
    expect(list[0].isOwner).toBe(true);
    expect(list[0].scope).toBe('own');
  });

  it('un catálogo de otro usuario no aparece como propio', async () => {
    const [item] = await listPrivateCatalogs('otro-user');
    expect(item.isOwner).toBe(false);
  });

  it('propaga un fallo de la consulta con mensaje en español', async () => {
    builders.catalogs = makeBuilder({ data: null, error: { message: 'boom' } }, ['maybeSingle', 'single']);
    await expect(listPrivateCatalogs('user-1')).rejects.toThrow('No fue posible cargar los catálogos: boom');
  });
});

describe('getPrivateCatalog', () => {
  it('devuelve null cuando el catálogo no existe o no es visible', async () => {
    builders.catalogs.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getPrivateCatalog('cat-1')).resolves.toBeNull();
  });

  it('carga capítulos y elementos ordenados por sort_order', async () => {
    builders.catalogs.maybeSingle.mockResolvedValueOnce({ data: CATALOG_ROW, error: null });
    const detail = await getPrivateCatalog('cat-1');
    expect(detail?.id).toBe('cat-1');
    expect(builders.catalog_sections.order).toHaveBeenCalledWith('sort_order');
    expect(builders.catalog_items.order).toHaveBeenCalledWith('sort_order');
  });
});

describe('createPrivateCatalog', () => {
  it('inserta con el usuario como dueño, sin visibility y sin precios', async () => {
    builders.catalogs.single.mockResolvedValueOnce({ data: { id: 'nuevo' }, error: null });
    await expect(createPrivateCatalog({ internalTitle: '  Lavadoras  ' })).resolves.toEqual({ id: 'nuevo' });

    const payload = builders.catalogs.insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      owner_id: 'user-1',
      internal_title: 'Lavadoras',
      // Vacío hereda el nombre interno.
      public_title: 'Lavadoras',
      status: 'draft',
      template: 'editorial',
      show_price: false,
      show_contact: true,
    });
    // La visibilidad la decide el trigger según el rol de quien crea.
    expect(payload).not.toHaveProperty('visibility');
  });

  it('respeta el título público cuando se escribió', async () => {
    builders.catalogs.single.mockResolvedValueOnce({ data: { id: 'nuevo' }, error: null });
    await createPrivateCatalog({ internalTitle: 'Interno', publicTitle: 'Público' });
    expect(builders.catalogs.insert.mock.calls[0][0].public_title).toBe('Público');
  });

  it('exige sesión', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(createPrivateCatalog({ internalTitle: 'Interno' })).rejects.toThrow('Sesión no válida');
  });
});

describe('updateCatalogCoverText', () => {
  it('guarda los textos recortados', async () => {
    await updateCatalogCoverText('cat-1', { internalTitle: ' A ', publicTitle: ' B ', introduction: null });
    expect(builders.catalogs.update).toHaveBeenCalledWith({ internal_title: 'A', public_title: 'B', introduction: null });
    expect(builders.catalogs.eq).toHaveBeenCalledWith('id', 'cat-1');
  });
});

describe('archiveOwnCatalog', () => {
  it('llama al RPC que revoca los enlaces y archiva', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await archiveOwnCatalog('cat-1');
    expect(mockRpc).toHaveBeenCalledWith('archive_own_catalog', { p_catalog_id: 'cat-1' });
  });

  it('propaga el error del RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'no permitido' } });
    await expect(archiveOwnCatalog('cat-1')).rejects.toThrow('No fue posible archivar el catálogo: no permitido');
  });
});
