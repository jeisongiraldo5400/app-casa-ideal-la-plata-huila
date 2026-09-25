import { isQuickShareCatalog, QUICK_SHARE_PREFIX, quickShareTitle } from '../quickShare';
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
