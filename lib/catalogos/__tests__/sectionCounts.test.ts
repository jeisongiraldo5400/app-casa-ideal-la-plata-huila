import type { PublicCatalogListingItem } from '../publicCatalogTypes';
import {
  countCatalogProducts,
  isCompletePreview,
  pendingCategoriesThrough,
  resolveCatalogSections,
  summarizeSectionProducts,
  type CategoryPreview,
} from '../sectionCounts';
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
    const sections = [{ id: 's-1', items: [category('cat-sala')] }, { id: 's-2', items: [product('p-7')] }];
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

describe('resolveCatalogSections', () => {
  const many = (count: number, prefix = 'p') => Array.from({ length: count }, (_, index) => listing(`${prefix}-${index + 1}`));

  it('lista los productos de una categoría completa «siempre al día» junto con los sueltos', () => {
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: many(3), totalCount: 3 }]]);
    const products = new Map([['x-1', listing('x-1', 'cat-otra')]]);
    const [resolved] = resolveCatalogSections([{ id: 's-1', items: [product('x-1'), category('cat-sala')] }], products, categories);
    expect(resolved.products.map((item) => item.productId)).toEqual(['x-1', 'p-1', 'p-2', 'p-3']);
    expect(resolved.count).toBe(4);
    expect(resolved.pendingCategoryIds).toEqual([]);
  });

  it('con solo la muestra cargada cuenta el total y deja la categoría pendiente', () => {
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: many(10), totalCount: 37 }]]);
    const [resolved] = resolveCatalogSections([{ id: 's-1', items: [category('cat-sala')] }], new Map(), categories);
    expect(resolved.products).toHaveLength(10);
    expect(resolved.count).toBe(37);
    expect(resolved.pendingCategoryIds).toEqual(['cat-sala']);
  });

  it('un producto sale una sola vez: en la primera categoría que lo tiene (como la revista del web)', () => {
    const categories = new Map<string, CategoryPreview>([['cat-sala', { items: many(3), totalCount: 3 }]]);
    const products = new Map([['p-2', listing('p-2')]]);
    const [first, second] = resolveCatalogSections(
      [
        { id: 's-1', items: [product('p-2')] },
        { id: 's-2', items: [category('cat-sala')] },
      ],
      products,
      categories
    );
    expect(first.products.map((item) => item.productId)).toEqual(['p-2']);
    expect(second.products.map((item) => item.productId)).toEqual(['p-1', 'p-3']);
    expect(second.repeated).toBe(1);
    expect(countCatalogProducts([{ id: 's-1', items: [product('p-2')] }, { id: 's-2', items: [category('cat-sala')] }], products, categories)).toBe(3);
  });

  it('pendingCategoriesThrough junta las pendientes de la sección y de las anteriores', () => {
    const categories = new Map<string, CategoryPreview>([
      ['cat-a', { items: many(2, 'a'), totalCount: 20 }],
      ['cat-b', { items: many(2, 'b'), totalCount: 2 }],
      ['cat-c', { items: many(2, 'c'), totalCount: 30 }],
    ]);
    const resolved = resolveCatalogSections(
      [
        { id: 's-1', items: [category('cat-a')] },
        { id: 's-2', items: [category('cat-b')] },
        { id: 's-3', items: [category('cat-c')] },
      ],
      new Map(),
      categories
    );
    expect(pendingCategoriesThrough(resolved, 1)).toEqual(['cat-a']);
    expect(pendingCategoriesThrough(resolved, 2)).toEqual(['cat-a', 'cat-c']);
  });
});
