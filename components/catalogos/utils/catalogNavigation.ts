import type { Router } from 'expo-router';

/** Pestaña con la lista de catálogos. */
export const CATALOGS_TAB_HREF = '/(tabs)/catalogos';

type CatalogRouter = Pick<Router, 'navigate' | 'push' | 'replace' | 'back' | 'canGoBack'>;

/**
 * Tras crear un catálogo desde la pestaña «Nuevo catálogo» la pila queda:
 * pestañas (en Catálogos) → Detalle → Productos, sin el formulario en medio.
 *
 * `replace` desde una pestaña NO sirve: expo-router lo resuelve contra la pila
 * raíz y sustituye la ruta `(tabs)` completa (se pierde el estado de las
 * pestañas y en Android «atrás» cierra la app). Las tres acciones se calculan
 * con el estado actual y se encolan en orden: la primera cambia de pestaña
 * dentro del navegador de pestañas y las dos siguientes apilan en la raíz.
 */
export function openCreatedCatalog(router: CatalogRouter, catalogId: string): void {
  router.navigate(CATALOGS_TAB_HREF as never);
  router.push(`/catalogo/${catalogId}` as never);
  router.push(`/catalogo/${catalogId}/productos` as never);
}

/**
 * Salir de un catálogo que ya no está disponible (p. ej. recién archivado).
 * Sin pantalla previa (enlace directo) se reemplaza por la lista para que
 * «atrás» no vuelva al catálogo archivado.
 */
export function leaveCatalog(router: CatalogRouter): void {
  if (router.canGoBack()) router.back();
  else router.replace(CATALOGS_TAB_HREF as never);
}
