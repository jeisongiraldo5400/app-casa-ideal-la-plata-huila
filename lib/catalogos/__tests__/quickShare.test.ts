import {
  isQuickShareCatalog,
  QUICK_SHARE_MAX_PRODUCTS,
  QUICK_SHARE_PREFIX,
  quickShareBundleTitles,
  quickShareTitle,
  summarizeProductNames,
  toggleProductSelection,
} from '../quickShare';
import { TITLE_MAX } from '../validators';

describe('quickShareTitle', () => {
  it('antepone el prefijo al nombre del producto', () => {
    expect(quickShareTitle('Armario 120 Yes Negro')).toBe('Envío rápido · Armario 120 Yes Negro');
  });

  it('no deja un título vacío', () => {
    expect(quickShareTitle('   ')).toBe('Envío rápido · Producto');
  });

  it('respeta el máximo de caracteres del título', () => {
    const titulo = quickShareTitle('X'.repeat(200));
    expect(titulo.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(titulo.startsWith(QUICK_SHARE_PREFIX)).toBe(true);
    expect(titulo.endsWith('…')).toBe(true);
  });

  // Es la clave para reutilizar la edición: el mismo producto da el mismo título.
  it('el mismo producto da siempre el mismo título', () => {
    expect(quickShareTitle('Nevera 250')).toBe(quickShareTitle(' Nevera 250 '));
  });
});

describe('isQuickShareCatalog', () => {
  it('reconoce las ediciones de envío rápido', () => {
    expect(isQuickShareCatalog('Envío rápido · Nevera')).toBe(true);
    expect(isQuickShareCatalog('Muebles de sala')).toBe(false);
    expect(isQuickShareCatalog(null)).toBe(false);
  });
});

describe('varios productos (pedido 2026-09-29)', () => {
  it('resume los nombres: dos citados y el resto como «y N más»', () => {
    expect(summarizeProductNames(['Nevera'])).toBe('Nevera');
    expect(summarizeProductNames(['Nevera', 'Sofá'])).toBe('Nevera y Sofá');
    expect(summarizeProductNames(['Nevera', 'Sofá', 'Mesa', 'Silla'])).toBe('Nevera, Sofá y 2 más');
  });

  it('la edición de varios lleva el prefijo (se pliega con los envíos rápidos) y la cantidad', () => {
    const titles = quickShareBundleTitles(['Nevera', 'Sofá', 'Mesa']);
    expect(titles.internalTitle).toBe('Envío rápido · 3 productos: Nevera, Sofá y 1 más');
    expect(isQuickShareCatalog(titles.internalTitle)).toBe(true);
    expect(titles.publicTitle).toBe('Nevera, Sofá y 1 más');
  });

  it('los títulos nunca pasan del máximo', () => {
    const titles = quickShareBundleTitles(['X'.repeat(200), 'Y'.repeat(200)]);
    expect(titles.internalTitle.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(titles.publicTitle.length).toBeLessThanOrEqual(TITLE_MAX);
  });
});

describe('toggleProductSelection', () => {
  const p = (productId: string) => ({ productId });

  it('añade y quita conservando el orden de elección', () => {
    let selection = toggleProductSelection([], p('a')).selection;
    selection = toggleProductSelection(selection, p('b')).selection;
    selection = toggleProductSelection(selection, p('c')).selection;
    selection = toggleProductSelection(selection, p('b')).selection;
    expect(selection.map((item) => item.productId)).toEqual(['a', 'c']);
  });

  it(`con ${QUICK_SHARE_MAX_PRODUCTS} elegidos no añade más, pero sí deja quitar`, () => {
    const full = Array.from({ length: QUICK_SHARE_MAX_PRODUCTS }, (_, index) => p(`p-${index}`));
    const blocked = toggleProductSelection(full, p('otro'));
    expect(blocked.limitReached).toBe(true);
    expect(blocked.selection).toHaveLength(QUICK_SHARE_MAX_PRODUCTS);

    const removed = toggleProductSelection(full, p('p-0'));
    expect(removed.limitReached).toBe(false);
    expect(removed.selection).toHaveLength(QUICK_SHARE_MAX_PRODUCTS - 1);
  });
});
