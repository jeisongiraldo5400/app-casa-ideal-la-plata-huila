import type { PublicCatalogListingItem } from './publicCatalogTypes';
import type { CatalogSection } from './types';

// Conteo de fichas por categoría con lo que el detalle ya cargó: productos
// sueltos (completos) y, de cada categoría completa, solo una muestra
// acotada más su total. Sin I/O.

/** Primeras fichas de una categoría completa y cuántas tiene en total. */
export type CategoryPreview = {
  items: readonly PublicCatalogListingItem[];
  totalCount: number;
};

export type SectionProductSummary = {
  /** Fichas publicadas distintas que ya se pueden pintar (para miniaturas). */
  visible: PublicCatalogListingItem[];
  /** Fichas publicadas de la categoría, incluidas las que no se cargaron. */
  count: number;
  /** Productos sueltos sin ficha publicada: no saldrán en la revista. */
  unpublished: number;
  /** `false` si alguna categoría completa aún no tiene muestra cargada. */
  known: boolean;
};

/** La muestra trae todas las fichas: el snapshot puede reutilizarla tal cual. */
export function isCompletePreview(preview: CategoryPreview | undefined): preview is CategoryPreview {
  return Boolean(preview && preview.items.length >= preview.totalCount);
}

export function summarizeSectionProducts(
  section: Pick<CatalogSection, 'items'>,
  products: ReadonlyMap<string, PublicCatalogListingItem>,
  categories: ReadonlyMap<string, CategoryPreview>
): SectionProductSummary {
  const unique = new Map<string, PublicCatalogListingItem>();
  let unpublished = 0;
  let notLoaded = 0;
  let known = true;

  for (const item of section.items) {
    if (item.itemType === 'product') {
      const product = products.get(item.referenceId);
      if (product) unique.set(product.productId, product);
      else unpublished += 1;
      continue;
    }
    const preview = categories.get(item.referenceId);
    if (!preview) {
      known = false;
      continue;
    }
    for (const product of preview.items) unique.set(product.productId, product);
    // Las fichas que no vinieron en la muestra no se pueden deduplicar: se
    // suman tal cual (exacto salvo que un producto suelto también esté ahí).
    notLoaded += Math.max(0, preview.totalCount - preview.items.length);
  }

  return { visible: [...unique.values()], count: unique.size + notLoaded, unpublished, known };
}

/** Total de fichas del catálogo, sumando categoría por categoría (mismo criterio que la preparación). */
export function countCatalogProducts(
  sections: readonly Pick<CatalogSection, 'items'>[],
  products: ReadonlyMap<string, PublicCatalogListingItem>,
  categories: ReadonlyMap<string, CategoryPreview>
): number {
  return sections.reduce((total, section) => total + summarizeSectionProducts(section, products, categories).count, 0);
}
