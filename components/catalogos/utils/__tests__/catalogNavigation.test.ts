import { CATALOGS_TAB_HREF, leaveCatalog, openCreatedCatalog } from '../catalogNavigation';

function makeRouter(canGoBack: boolean) {
  const calls: string[] = [];
  const record = (name: string) => jest.fn((href?: unknown) => calls.push(href === undefined ? name : `${name} ${String(href)}`));
  return {
    calls,
    router: {
      navigate: record('navigate'),
      push: record('push'),
      replace: record('replace'),
      back: record('back'),
      canGoBack: jest.fn(() => canGoBack),
    },
  };
}

describe('openCreatedCatalog', () => {
  it('vuelve a la pestaña Catálogos y apila Detalle y Productos, sin reemplazar las pestañas', () => {
    const { router, calls } = makeRouter(false);

    openCreatedCatalog(router, 'cat-9');

    expect(calls).toEqual([`navigate ${CATALOGS_TAB_HREF}`, 'push /catalogo/cat-9', 'push /catalogo/cat-9/productos']);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('leaveCatalog', () => {
  it('con pantalla previa vuelve atrás', () => {
    const { router, calls } = makeRouter(true);
    leaveCatalog(router);
    expect(calls).toEqual(['back']);
  });

  it('sin pantalla previa reemplaza por la lista de catálogos', () => {
    const { router, calls } = makeRouter(false);
    leaveCatalog(router);
    expect(calls).toEqual([`replace ${CATALOGS_TAB_HREF}`]);
  });
});
