import { supabase } from '@/lib/supabase';
import { DEFAULT_SECTION_TITLE } from '@/lib/catalogos/constants';
import type { CatalogSection } from '@/lib/catalogos/types';
import type { SectionRow } from '../database';

function isDuplicateError(message: string): boolean {
  return /duplicate|duplicad|unique/i.test(message);
}

async function ensureFirstSection(catalogId: string, sections: readonly CatalogSection[]): Promise<{ id: string; itemCount: number }> {
  const first = sections[0];
  if (first) return { id: first.id, itemCount: first.items.length };

  const { data, error } = await supabase
    .from('catalog_sections')
    .insert({ catalog_id: catalogId, title: DEFAULT_SECTION_TITLE, kicker: null, body: null, image_url: null, sort_order: 0 })
    .select('id')
    .single();
  if (error) throw new Error(`No fue posible crear el capítulo: ${error.message}`);
  return { id: (data as Pick<SectionRow, 'id'>).id, itemCount: 0 };
}

/**
 * Añade o quita un producto de la edición. Réplica de
 * `toggleCatalogProductAction` del web: el primer capítulo se crea solo, y
 * un duplicado (misma ficha ya en el capítulo) no es un error.
 */
export async function toggleCatalogProduct(
  catalogId: string,
  productId: string,
  shouldAdd: boolean,
  sections: readonly CatalogSection[]
): Promise<void> {
  if (!shouldAdd) {
    const { error } = await supabase
      .from('catalog_items')
      .delete()
      .eq('catalog_id', catalogId)
      .eq('item_type', 'product')
      .eq('reference_id', productId);
    if (error) throw new Error(`No fue posible quitar el producto: ${error.message}`);
    return;
  }

  const section = await ensureFirstSection(catalogId, sections);
  const { error } = await supabase.from('catalog_items').insert({
    catalog_id: catalogId,
    section_id: section.id,
    item_type: 'product',
    reference_id: productId,
    is_featured: false,
    sort_order: section.itemCount,
  });
  if (error && !isDuplicateError(error.message)) {
    throw new Error(`No fue posible añadir el producto: ${error.message}`);
  }
}

export async function removeCatalogItem(catalogId: string, itemId: string): Promise<void> {
  const { error } = await supabase.from('catalog_items').delete().eq('id', itemId).eq('catalog_id', catalogId);
  if (error) throw new Error(`No fue posible quitar el elemento: ${error.message}`);
}
