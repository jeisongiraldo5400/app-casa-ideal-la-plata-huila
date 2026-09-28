// Roles de catálogo tal como viven en `roles.nombre`. Copia reducida de
// `catalogo-casa-ideal/src/features/auth/access.ts`: en móvil todos los
// roles hacen lo mismo (crear y editar lo propio), así que solo se deriva
// si el usuario entra al módulo. Lo demás (portada, multimedia, revocar,
// editar ajenos) vive en el panel web.
export const CATALOG_ROLES = {
  SYSTEM_ADMIN: 'admin',
  ADMIN: 'catalog_admin',
  EDITOR: 'catalog_editor',
  /** Arma catálogos para sus clientes. Es un rol propio del catálogo, no el `vendedor` del ERP. */
  SELLER: 'catalog_seller',
} as const;

export const CATALOG_ROLE_NAMES: readonly string[] = Object.values(CATALOG_ROLES);

export type CatalogAccess = {
  /** Ve el módulo: sus catálogos y los de otras personas que la RLS le deja ver. */
  canAccessCatalogs: boolean;
  /** Crea catálogos y edita los propios (permiso `catalog.catalogs.manage`). */
  canManageCatalog: boolean;
  /** Genera y reemite enlaces (permiso `catalog.catalogs.share` o `catalog.catalogs.publish`). */
  canCreateShareLink: boolean;
  /** Ve «Catálogos del equipo» (lo de otras personas): solo `admin` y `catalog_admin` (2026-09-28). */
  canSeeTeamCatalogs: boolean;
};

export const NO_CATALOG_ACCESS: CatalogAccess = {
  canAccessCatalogs: false,
  canManageCatalog: false,
  canCreateShareLink: false,
  canSeeTeamCatalogs: false,
};

export const FULL_CATALOG_ACCESS: CatalogAccess = {
  canAccessCatalogs: true,
  canManageCatalog: true,
  canCreateShareLink: true,
  canSeeTeamCatalogs: false,
};

export function hasCatalogRole(roleNames: readonly string[]): boolean {
  const roles = new Set(roleNames.map((role) => role.trim().toLowerCase()));
  return CATALOG_ROLE_NAMES.some((role) => roles.has(role));
}

export function deriveCatalogAccess(roleNames: readonly string[]): CatalogAccess {
  if (!hasCatalogRole(roleNames)) return NO_CATALOG_ACCESS;
  const roles = new Set(roleNames.map((role) => role.trim().toLowerCase()));
  const isAdministrator = roles.has(CATALOG_ROLES.SYSTEM_ADMIN) || roles.has(CATALOG_ROLES.ADMIN);
  return { ...FULL_CATALOG_ACCESS, canSeeTeamCatalogs: isAdministrator };
}
