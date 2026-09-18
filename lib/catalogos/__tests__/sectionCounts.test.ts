import type { PublicCatalogListingItem } from '../publicCatalogTypes';
import { countCatalogProducts, isCompletePreview, summarizeSectionProducts, type CategoryPreview } from '../sectionCounts';
import type { CatalogItem } from '../types';

function listing(productId: string, categoryId = 'cat-sala'): PublicCatalogListingItem {
  return {
    catalogProductId: `cp-${productId}`,
    productId,
    slug: productId,
    displayName: productId,
    shortDescription: null,
    stockQuantity: 1,
    categoryId,
    categoryName: 'Sala',
    brandName: null,
    isFeatured: false,
    coverImageUrl: null,
    publishedAt: null,
  };
}

const product = (referenceId: string): CatalogItem => ({ id: `i-${referenceId}`, itemType: 'product', referenceId, isFeatured: false, sortOrder: 0 });
const category = (referenceId: string): CatalogItem => ({ id: `i-${referenceId}`, itemType: 'category', referenceId, isFeatured: false, sortOrder: 0 });

describe('summarizeSectionProducts', () => {
  it('cuenta las categorías completas con su total, no solo con la muestra cargada', () => {
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: [listing('p-1'), listing('p-2')], totalCount: 25 }]]);
    const summary = summarizeSectionProducts({ items: [category('cat-sala')] }, new Map(), categories);
    expect(summary.count).toBe(25);
    expect(summary.visible).toHaveLength(2);
    expect(summary.known).toBe(true);
  });

  it('no cuenta dos veces un producto suelto que también viene en la muestra', () => {
    const products = new Map([['p-1', listing('p-1')]]);
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: [listing('p-1'), listing('p-2')], totalCount: 2 }]]);
    expect(summarizeSectionProducts({ items: [product('p-1'), category('cat-sala')] }, products, categories).count).toBe(2);
  });

  it('separa los productos sin ficha publicada', () => {
    const summary = summarizeSectionProducts({ items: [product('p-1'), product('p-x')] }, new Map([['p-1', listing('p-1')]]), new Map());
    expect(summary.count).toBe(1);
    expect(summary.unpublished).toBe(1);
  });

  it('marca como desconocida una categoría sin muestra', () => {
    const summary = summarizeSectionProducts({ items: [category('cat-otra')] }, new Map(), new Map());
    expect(summary.known).toBe(false);
    expect(summary.count).toBe(0);
  });
});

describe('countCatalogProducts', () => {
  it('suma categoría por categoría (antes daba «Fichas: 0» en catálogos por categoría)', () => {
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: [listing('p-1')], totalCount: 9 }]]);
    const sections = [{ items: [category('cat-sala')] }, { items: [product('p-7')] }];
    expect(countCatalogProducts(sections, new Map([['p-7', listing('p-7')]]), categories)).toBe(10);
  });
});

describe('isCompletePreview', () => {
  it('solo es completa si trae todas las fichas', () => {
    expect(isCompletePreview({ items: [listing('p-1')], totalCount: 1 })).toBe(true);
    expect(isCompletePreview({ items: [], totalCount: 0 })).toBe(true);
    expect(isCompletePreview({ items: [listing('p-1')], totalCount: 3 })).toBe(false);
    expect(isCompletePreview(undefined)).toBe(false);
  });
});
