import type { PublicCatalogListingItem, PublicCatalogProductDetail } from './publicCatalogTypes';
import { evaluateCatalogReadiness } from './readiness';
import type { CatalogItemType, CatalogSection, MagazineProduct, MagazineSnapshot, PrivateCatalog } from './types';

// Constructor PURO del snapshot (sin I/O). Reproduce paso a paso
// `catalogo-casa-ideal/src/features/private-catalogs/snapshot.server.ts`:
// el service de móvil resuelve los datos con los mismos RPC y los pasa aquí.
// Si cambia la forma del snapshot en el web, hay que cambiarla aquí también.

export type SelectionIds = {
  productIds: string[];
  categoryIds: string[];
};

export type ListingIndex = {
  byProductId: Map<string, PublicCatalogListingItem>;
  byCategoryId: Map<string, PublicCatalogListingItem[]>;
};

export function collectSelectionIds(sections: readonly CatalogSection[]): SelectionIds {
  const productIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      (item.itemType === 'product' ? productIds : categoryIds).add(item.referenceId);
    }
  }
  return { productIds: [...productIds], categoryIds: [...categoryIds] };
}

export function buildListingIndex(
  products: readonly PublicCatalogListingItem[],
  categories: readonly (readonly [string, PublicCatalogListingItem[]])[]
): ListingIndex {
  return {
    byProductId: new Map(products.map((product) => [product.productId, product])),
    byCategoryId: new Map(categories),
  };
}

/** Expande un elemento de categoría (producto suelto o categoría completa) a fichas publicadas. */
export function matchListingItems(index: ListingIndex, itemType: CatalogItemType, referenceId: string): PublicCatalogListingItem[] {
  if (itemType === 'product') {
    const product = index.byProductId.get(referenceId);
    return product ? [product] : [];
  }
  return index.byCategoryId.get(referenceId) ?? [];
}

/** Slugs distintos a resolver: una ficha en varias categorías se pide una sola vez. */
export function collectSelectedSlugs(sections: readonly CatalogSection[], index: ListingIndex): string[] {
  const slugs = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      for (const product of matchListingItems(index, item.itemType, item.referenceId)) {
        slugs.add(product.slug);
      }
    }
  }
  return [...slugs];
}

export type BuildSnapshotInput = {
  catalog: Pick<
    PrivateCatalog,
    'publicTitle' | 'introduction' | 'coverImageUrl' | 'accentColor' | 'template' | 'showPrice' | 'showAvailability' | 'showSku' | 'showContact'
  >;
  sections: readonly CatalogSection[];
  index: ListingIndex;
  detailBySlug: ReadonlyMap<string, PublicCatalogProductDetail>;
  publishedAt: string;
};

export type SnapshotAnalysis = {
  snapshot: MagazineSnapshot;
  blockers: string[];
  warnings: string[];
};

/**
 * Quita de cada grupo lo que ya apareció en uno anterior: un producto se
 * muestra una sola vez, en la primera sección que lo tiene. `merge` recibe el
 * que se queda y la repetición descartada. Copia de `dedupeAcrossSections`
 * (`catalogo-casa-ideal/src/features/private-catalogs/category-sync.ts`).
 */
export function dedupeAcrossSections<T>(
  groups: readonly (readonly T[])[],
  key: (value: T) => string,
  merge?: (kept: T, repeated: T) => void
): { groups: T[][]; repeated: number[] } {
  const kept = new Map<string, T>();
  const repeated: number[] = [];
  const result = groups.map((group) => {
    let dropped = 0;
    const next: T[] = [];
    for (const value of group) {
      const id = key(value);
      const previous = kept.get(id);
      if (previous !== undefined) {
        merge?.(previous, value);
        dropped += 1;
        continue;
      }
      kept.set(id, value);
      next.push(value);
    }
    repeated.push(dropped);
    return next;
  });
  return { groups: result, repeated };
}

export function buildMagazineSnapshot({ catalog, sections, index, detailBySlug, publishedAt }: BuildSnapshotInput): SnapshotAnalysis {
  const resolved = sections.map((section) =>
    section.items.flatMap((item) =>
      matchListingItems(index, item.itemType, item.referenceId).flatMap<MagazineProduct>((product) => {
        const detail = detailBySlug.get(product.slug);
        return detail ? [{ ...detail, featured: item.isFeatured }] : [];
      })
    )
  );
  // Como el web: un producto sale una sola vez, en la primera sección que lo
  // tiene (p. ej. suelto y además dentro de su categoría completa). Si alguna
  // aparición lo destacaba, queda destacado.
  const deduped = dedupeAcrossSections(
    resolved,
    (product) => product.productId,
    (kept, repeated) => {
      kept.featured = kept.featured || repeated.featured;
    }
  );

  const snapshotSections = sections.map((section, position) => ({
    id: section.id,
    title: section.title,
    kicker: section.kicker,
    body: section.body,
    imageUrl: section.imageUrl,
    products: deduped.groups[position] ?? [],
  }));

  const readiness = evaluateCatalogReadiness(
    snapshotSections.map((section, position) => ({
      title: section.title,
      productCount: section.products.length,
      repeatedCount: deduped.repeated[position] ?? 0,
    }))
  );

  return {
    snapshot: {
      schemaVersion: 1,
      catalog: {
        publicTitle: catalog.publicTitle,
        introduction: catalog.introduction,
        coverImageUrl: catalog.coverImageUrl,
        accentColor: catalog.accentColor,
        template: catalog.template,
        showPrice: catalog.showPrice,
        showAvailability: catalog.showAvailability,
        showSku: catalog.showSku,
        showContact: catalog.showContact,
      },
      sections: snapshotSections,
      publishedAt,
    },
    blockers: readiness.blockers,
    warnings: readiness.warnings,
  };
}
