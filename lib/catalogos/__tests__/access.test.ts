import { CATALOG_ROLES, deriveCatalogAccess, hasCatalogRole, NO_CATALOG_ACCESS } from '../access';

describe('deriveCatalogAccess', () => {
  it('deniega el módulo a usuarios sin ningún rol de catálogo', () => {
    expect(deriveCatalogAccess(['bodeguero'])).toEqual(NO_CATALOG_ACCESS);
    expect(deriveCatalogAccess([])).toEqual(NO_CATALOG_ACCESS);
  });

  it('el vendedor del ERP, por sí solo, no entra al módulo', () => {
    // `vendedor` es rol del ERP; el acceso lo da `catalog_seller`.
    expect(deriveCatalogAccess(['vendedor'])).toEqual(NO_CATALOG_ACCESS);
  });

  it.each([CATALOG_ROLES.SYSTEM_ADMIN, CATALOG_ROLES.ADMIN, CATALOG_ROLES.EDITOR, CATALOG_ROLES.SELLER])(
    'da las mismas capacidades a %s (en móvil todos crean y comparten lo suyo)',
    (role) => {
      expect(deriveCatalogAccess([role])).toEqual({
        canAccessCatalogs: true,
        canManageCatalog: true,
        canCreateShareLink: true,
      });
    }
  );

  it('ignora mayúsculas y espacios en el nombre del rol', () => {
    expect(hasCatalogRole([' Catalog_Seller '])).toBe(true);
  });

  it('un vendedor con los dos roles entra al módulo', () => {
    expect(deriveCatalogAccess(['vendedor', CATALOG_ROLES.SELLER]).canAccessCatalogs).toBe(true);
  });
});
