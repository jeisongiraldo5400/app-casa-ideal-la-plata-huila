type Builder = Record<string, jest.Mock>;

const builders: Record<string, Builder> = {};
const mockFrom = jest.fn((table: string) => builders[table]);
const mockRpc = jest.fn();
const mockGetSession = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: () => mockGetSession(), getUser: () => mockGetUser() },
  },
}));

import {
  archiveOwnCatalog,
  createPrivateCatalog,
  fetchCatalogThumbnails,
  getPrivateCatalog,
  IN_FILTER_BATCH_SIZE,
  listPrivateCatalogs,
  POSTGREST_PAGE_SIZE,
  THUMBNAIL_BATCH_SIZE,
  updateCatalogCoverText,
} from '../catalogsService';

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
  for (const method of ['select', 'eq', 'is', 'order', 'insert', 'update', 'delete', 'in', 'range']) {
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
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
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
    // `updated_at` cambia con cada mutación: el id desempata entre páginas.
    expect(builders.catalogs.order).toHaveBeenCalledWith('id');
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

  it('pide los enlaces solo de los catálogos listados y sin el token', async () => {
    await listPrivateCatalogs('user-1');
    const columns = builders.catalog_share_links.select.mock.calls[0][0] as string;
    expect(columns.split(',')).not.toContain('token');
    expect(columns).not.toContain('token_hash');
    expect(builders.catalog_share_links.in).toHaveBeenCalledWith('catalog_id', ['cat-1']);
    expect(builders.catalog_versions.in).toHaveBeenCalledWith('catalog_id', ['cat-1']);
  });

  it('sin catálogos no consulta enlaces ni versiones', async () => {
    builders.catalogs = makeBuilder({ data: [], error: null });
    await expect(listPrivateCatalogs('user-1')).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith('catalog_share_links');
    expect(mockFrom).not.toHaveBeenCalledWith('catalog_versions');
  });

  it('reparte los ids en lotes y pagina más allá del tope de 1000 filas', async () => {
    const rows = Array.from({ length: IN_FILTER_BATCH_SIZE + 1 }, (_, index) => ({ ...CATALOG_ROW, id: `cat-${index}` }));
    builders.catalogs = makeBuilder({ data: rows, error: null });
    const fullPage = Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => ({
      id: `link-${index}`,
      catalog_id: 'cat-0',
      catalog_version_id: 'v-1',
      label: '',
      token_hint: 'abc',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
      created_at: '2026-09-01T00:00:00Z',
      first_viewed_at: null,
      last_viewed_at: null,
      view_count: 1,
    }));
    const pages = [fullPage, [fullPage[0]]];
    const links = makeBuilder({ data: [], error: null });
    (links as unknown as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: pages.shift() ?? [], error: null }).then(resolve);
    builders.catalog_share_links = links;

    const list = await listPrivateCatalogs('user-1');

    expect(links.in).toHaveBeenCalledTimes(3);
    expect((links.in.mock.calls[0][1] as string[]).length).toBe(IN_FILTER_BATCH_SIZE);
    expect(links.range).toHaveBeenCalledWith(0, POSTGREST_PAGE_SIZE - 1);
    expect(links.range).toHaveBeenCalledWith(POSTGREST_PAGE_SIZE, 2 * POSTGREST_PAGE_SIZE - 1);
    expect(list.find((item) => item.id === 'cat-0')?.linkCount).toBe(POSTGREST_PAGE_SIZE + 1);
    expect(list.find((item) => item.id === 'cat-0')?.shareLinks[0].token).toBeNull();
  });
});

describe('miniatura del primer producto', () => {
  const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://base.example.supabase.co';
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
  });

  it('pide la foto en una sola llamada y la pone en cada catálogo sin portada', async () => {
    builders.catalogs = makeBuilder({
      data: [
        CATALOG_ROW,
        { ...CATALOG_ROW, id: 'cat-2', cover_image_url: 'https://x/portada.jpg' },
        { ...CATALOG_ROW, id: 'cat-3', owner_id: 'admin', visibility: 'organization', status: 'published' },
        // Privado ajeno (el admin lo recibe por la RLS): no se dibuja, no se pide.
        { ...CATALOG_ROW, id: 'cat-4', owner_id: 'otro', visibility: 'private' },
      ],
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [{ catalog_id: 'cat-1', bucket: 'catalog-images', storage_path: 'fichas/nevera 1.jpg' }],
      error: null,
    });

    const list = await listPrivateCatalogs('user-1');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_catalog_list_thumbnails', { p_catalog_ids: ['cat-1', 'cat-3'] });
    const byId = new Map(list.map((item) => [item.id, item.firstProductImageUrl]));
    expect(byId.get('cat-1')).toBe('https://base.example.supabase.co/storage/v1/object/public/catalog-images/fichas/nevera%201.jpg');
    expect(byId.get('cat-2')).toBeNull();
    expect(byId.get('cat-3')).toBeNull();
  });

  it('si la función falla la lista sale igual, sin foto', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function' } });
    const [item] = await listPrivateCatalogs('user-1');
    expect(item.internalTitle).toBe('Lavadoras');
    expect(item.firstProductImageUrl).toBeNull();

    mockRpc.mockRejectedValue(new Error('Network request failed'));
    const [offline] = await listPrivateCatalogs('user-1');
    expect(offline.firstProductImageUrl).toBeNull();
  });

  it('trocea en lotes del tope de la función, no una llamada por catálogo', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const ids = Array.from({ length: THUMBNAIL_BATCH_SIZE + 5 }, (_, index) => `cat-${index}`);
    await fetchCatalogThumbnails(ids);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1].p_catalog_ids).toHaveLength(THUMBNAIL_BATCH_SIZE);
    expect(mockRpc.mock.calls[1][1].p_catalog_ids).toHaveLength(5);
  });

  it('sin catálogos que la necesiten no llama a la base', async () => {
    await expect(fetchCatalogThumbnails([])).resolves.toEqual(new Map());
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('getPrivateCatalog', () => {
  it('devuelve null cuando el catálogo no existe o no es visible', async () => {
    builders.catalogs.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getPrivateCatalog('cat-1')).resolves.toBeNull();
  });

  it('trae el token de los enlaces para poder reenviarlos', async () => {
    builders.catalogs.maybeSingle.mockResolvedValueOnce({ data: CATALOG_ROW, error: null });
    await getPrivateCatalog('cat-1');
    expect((builders.catalog_share_links.select.mock.calls[0][0] as string).split(',')).toContain('token');
  });

  it('pagina categorías, elementos y enlaces más allá del tope de 1000 filas, con orden estable', async () => {
    builders.catalogs.maybeSingle.mockResolvedValueOnce({ data: CATALOG_ROW, error: null });
    const itemRow = (index: number) => ({
      id: `item-${index}`,
      catalog_id: 'cat-1',
      section_id: 'sec-1',
      item_type: 'product',
      reference_id: `p-${index}`,
      is_featured: false,
      sort_order: index,
    });
    const pages = [Array.from({ length: POSTGREST_PAGE_SIZE }, (_, index) => itemRow(index)), [itemRow(POSTGREST_PAGE_SIZE)]];
    const items = makeBuilder({ data: [], error: null });
    (items as unknown as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: pages.shift() ?? [], error: null }).then(resolve);
    builders.catalog_items = items;
    builders.catalog_sections = makeBuilder({
      data: [{ id: 'sec-1', catalog_id: 'cat-1', title: 'Productos', kicker: null, body: null, image_url: null, sort_order: 0 }],
      error: null,
    });

    const detail = await getPrivateCatalog('cat-1');

    expect(items.range).toHaveBeenCalledWith(0, POSTGREST_PAGE_SIZE - 1);
    expect(items.range).toHaveBeenCalledWith(POSTGREST_PAGE_SIZE, 2 * POSTGREST_PAGE_SIZE - 1);
    expect(items.order).toHaveBeenCalledWith('id');
    expect(detail?.sections[0].items).toHaveLength(POSTGREST_PAGE_SIZE + 1);
    for (const table of ['catalog_sections', 'catalog_share_links', 'catalog_versions']) {
      expect(builders[table].range).toHaveBeenCalledWith(0, POSTGREST_PAGE_SIZE - 1);
      expect(builders[table].order).toHaveBeenCalledWith('id');
    }
  });

  it('propaga el fallo de una consulta hija con su mensaje', async () => {
    builders.catalogs.maybeSingle.mockResolvedValueOnce({ data: CATALOG_ROW, error: null });
    builders.catalog_items = makeBuilder({ data: null, error: { message: 'boom' } });
    await expect(getPrivateCatalog('cat-1')).rejects.toThrow('No fue posible cargar los productos seleccionados: boom');
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
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(createPrivateCatalog({ internalTitle: 'Interno' })).rejects.toThrow('Sesión no válida');
  });

  it('toma el usuario de la sesión guardada, sin pedirlo al servidor', async () => {
    builders.catalogs.single.mockResolvedValueOnce({ data: { id: 'nuevo' }, error: null });
    await createPrivateCatalog({ internalTitle: 'Interno' });
    expect(mockGetSession).toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
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
