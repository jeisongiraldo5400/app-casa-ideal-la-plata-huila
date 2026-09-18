/**
 * Banderas de funcionalidades de la app móvil.
 *
 * Solo afectan a este cliente: los permisos del servidor, los datos y el panel
 * web siguen intactos. Se activan y desactivan cambiando el valor de la
 * constante; no hace falta borrar ni restaurar código.
 */

/**
 * Módulo de catálogos en móvil: las pestañas «Catálogos»
 * (`app/(tabs)/catalogos.tsx`) y «Nuevo catálogo»
 * (`app/(tabs)/catalogo-create.tsx`) y las pantallas de detalle de
 * `app/catalogo/**`.
 *
 * Apagado en la 3.1.0: el módulo viaja en la app pero no se muestra hasta que
 * se decida publicarlo. Con `false` no aparece en el menú de inicio,
 * las rutas no se registran en los layouts y, si alguien llega por enlace
 * profundo o escribiendo la ruta, la pantalla redirige al inicio sin pedir
 * datos de catálogos.
 *
 * Para volver a activarlo basta con poner `true`: vuelven el acceso del menú,
 * las rutas y la carga de datos, sujetos como siempre a los roles de catálogo
 * (`catalog_admin`, `catalog_editor`, `catalog_seller`).
 */
// El tipo es `boolean` a propósito (y no el literal `false`): así TypeScript
// sigue revisando las dos ramas de cada `if` y el día que se ponga en `true`
// no hay nada más que cambiar.
export const CATALOGOS_HABILITADOS: boolean = false;
