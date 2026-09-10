// Valores compartidos con el panel web (`catalogo-casa-ideal/src/features/
// private-catalogs/constants.ts`). Los `#hex` de este archivo son DATOS que
// se persisten en `catalogs.accent_color`, no tokens de interfaz: el móvil
// no pinta con ellos, solo los envía al crear (coinciden con el DEFAULT de
// la migración 20260914120000).

export const DEFAULT_CATALOG_ACCENT = '#1e3a8a';
export const DEFAULT_CATALOG_TEMPLATE = 'editorial' as const;

/** Nombre de la categoría inicial que se crea al añadir el primer producto. */
export const DEFAULT_SECTION_TITLE = 'Productos seleccionados';

/** Fichas por página en el selector de productos (decisión del usuario, por rendimiento). */
export const PICKER_PAGE_SIZE = 5;

/**
 * Solo para expandir selecciones de tipo «categoría» al construir el snapshot:
 * es el tope que impone el RPC `get_public_catalog_listing`, no se muestra.
 */
export const CATEGORY_PAGE_SIZE = 100;
export const MAX_CATEGORY_PAGES = 50;

/** Fichas que se resuelven en paralelo al armar el snapshot. */
export const DETAIL_CONCURRENCY = 4;
/** Categorías que se recorren en paralelo al armar el snapshot. */
export const CATEGORY_CONCURRENCY = 2;

/** Miniaturas por categoría en el detalle antes de resumir con «+N». */
export const SECTION_THUMB_LIMIT = 8;
