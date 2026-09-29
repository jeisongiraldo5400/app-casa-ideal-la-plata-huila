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

/**
 * Productos de cada categoría del catálogo tal como los verá el cliente, con
 * lo que el detalle ya cargó. Misma regla que el snapshot del web
 * (`dedupeAcrossSections`): un producto sale una sola vez, en la primera
 * categoría que lo tiene, y en el orden de sus elementos (sueltos y, de cada
 * categoría completa, en el orden del listado público).
 */
export type ResolvedSection = {
  sectionId: string;
  /** Fichas publicadas ya cargadas, sin repetidas entre categorías. */
  products: PublicCatalogListingItem[];
  /** Fichas que mostrará la categoría, incluidas las aún no cargadas. */
  count: number;
  /** Categorías completas de esta sección cuya lista aún no está entera. */
  pendingCategoryIds: string[];
  /** Productos sueltos sin ficha publicada: no saldrán en la revista. */
  unpublished: number;
  /** Fichas que ya salen en una categoría anterior (se muestran allí). */
  repeated: number;
};

export function resolveCatalogSections(
  sections: readonly Pick<CatalogSection, 'id' | 'items'>[],
  products: ReadonlyMap<string, PublicCatalogListingItem>,
  categories: ReadonlyMap<string, CategoryPreview>
): ResolvedSection[] {
  const seen = new Set<string>();
  return sections.map((section) => {
    const resolved: PublicCatalogListingItem[] = [];
    const pendingCategoryIds: string[] = [];
    let unpublished = 0;
    let repeated = 0;
    let notLoaded = 0;

    const take = (product: PublicCatalogListingItem) => {
      if (seen.has(product.productId)) {
        repeated += 1;
        return;
      }
      seen.add(product.productId);
      resolved.push(product);
    };

    for (const item of section.items) {
      if (item.itemType === 'product') {
        const product = products.get(item.referenceId);
        if (product) take(product);
        else unpublished += 1;
        continue;
      }
      const preview = categories.get(item.referenceId);
      if (!preview) {
        pendingCategoryIds.push(item.referenceId);
        continue;
      }
      for (const product of preview.items) take(product);
      // Las no cargadas no se pueden deduplicar todavía: se suman tal cual.
      const missing = preview.totalCount - preview.items.length;
      if (missing > 0) {
        pendingCategoryIds.push(item.referenceId);
        notLoaded += missing;
      }
    }

    return { sectionId: section.id, products: resolved, count: resolved.length + notLoaded, pendingCategoryIds, unpublished, repeated };
  });
}

/**
 * Categorías completas por cargar entera para mostrar bien la sección
 * `index`: las suyas y las de las anteriores (sin ellas no se sabe qué
 * productos ya salieron antes y cuáles le tocan a esta).
 */
export function pendingCategoriesThrough(resolved: readonly ResolvedSection[], index: number): string[] {
  return [...new Set(resolved.slice(0, index + 1).flatMap((section) => section.pendingCategoryIds))];
}

/** Total de fichas del catálogo, sin contar dos veces las que se repiten entre categorías. */
export function countCatalogProducts(
  sections: readonly Pick<CatalogSection, 'id' | 'items'>[],
  products: ReadonlyMap<string, PublicCatalogListingItem>,
  categories: ReadonlyMap<string, CategoryPreview>
): number {
  return resolveCatalogSections(sections, products, categories).reduce((total, section) => total + section.count, 0);
}
