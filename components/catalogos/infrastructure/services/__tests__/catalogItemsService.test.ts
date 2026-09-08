type Builder = Record<string, jest.Mock>;

const builders: Record<string, Builder> = {};
const mockFrom = jest.fn((table: string) => builders[table]);

jest.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

import type { CatalogSection } from '@/lib/catalogos/types';
import { removeCatalogItem, toggleCatalogProduct } from '../catalogItemsService';

function makeBuilder(result: { data: unknown; error: unknown }): Builder {
  const builder: Builder = {};
  for (const method of ['select', 'eq', 'insert', 'delete']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.single = jest.fn(async () => result);
  (builder as unknown as { then: unknown }).then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function section(id: string, itemCount: number): CatalogSection {
  return {
    id,
    title: 'Selección',
    kicker: null,
    body: null,
    imageUrl: null,
    sortOrder: 0,
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `i-${index}`,
      itemType: 'product' as const,
      referenceId: `p-${index}`,
      isFeatured: false,
      sortOrder: index,
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  builders.catalog_items = makeBuilder({ data: null, error: null });
  builders.catalog_sections = makeBuilder({ data: { id: 's-nueva' }, error: null });
});

describe('toggleCatalogProduct', () => {
  it('crea el capítulo «Selección» la primera vez y añade el producto', async () => {
    await toggleCatalogProduct('cat-1', 'p-1', true, []);
    expect(builders.catalog_sections.insert).toHaveBeenCalledWith(
      expect.objectContaining({ catalog_id: 'cat-1', title: 'Selección', sort_order: 0 })
    );
    expect(builders.catalog_items.insert).toHaveBeenCalledWith(
      expect.objectContaining({ catalog_id: 'cat-1', section_id: 's-nueva', item_type: 'product', reference_id: 'p-1', sort_order: 0 })
    );
  });

  it('reutiliza el primer capítulo existente y continúa el orden', async () => {
    await toggleCatalogProduct('cat-1', 'p-9', true, [section('s-1', 3)]);
    expect(builders.catalog_sections.insert).not.toHaveBeenCalled();
    expect(builders.catalog_items.insert).toHaveBeenCalledWith(expect.objectContaining({ section_id: 's-1', sort_order: 3 }));
  });

  it('ignora el error de duplicado (la ficha ya estaba en el capítulo)', async () => {
    builders.catalog_items = makeBuilder({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
    await expect(toggleCatalogProduct('cat-1', 'p-1', true, [section('s-1', 0)])).resolves.toBeUndefined();
  });

  it('propaga cualquier otro error al añadir', async () => {
    builders.catalog_items = makeBuilder({ data: null, error: { message: 'permiso denegado' } });
    await expect(toggleCatalogProduct('cat-1', 'p-1', true, [section('s-1', 0)])).rejects.toThrow('No fue posible añadir el producto');
  });

  it('al quitar borra por catálogo, tipo y referencia', async () => {
    await toggleCatalogProduct('cat-1', 'p-1', false, [section('s-1', 1)]);
    expect(builders.catalog_items.delete).toHaveBeenCalled();
    expect(builders.catalog_items.eq).toHaveBeenCalledWith('catalog_id', 'cat-1');
    expect(builders.catalog_items.eq).toHaveBeenCalledWith('item_type', 'product');
    expect(builders.catalog_items.eq).toHaveBeenCalledWith('reference_id', 'p-1');
  });
});

describe('removeCatalogItem', () => {
  it('acota el borrado al catálogo', async () => {
    await removeCatalogItem('cat-1', 'i-1');
    expect(builders.catalog_items.eq).toHaveBeenCalledWith('id', 'i-1');
    expect(builders.catalog_items.eq).toHaveBeenCalledWith('catalog_id', 'cat-1');
  });
});
