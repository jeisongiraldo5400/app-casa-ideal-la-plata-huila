/**
 * Sitio de pago: desde dónde se registró el cobro de una cuota.
 *
 * Todo pago hecho desde esta app es `app_movil`, sin importar si se registró en
 * línea o quedó encolado sin red; la app web escribe siempre `almacen`. No es un
 * catálogo administrable: son los dos canales que existen.
 */

export const PAYMENT_SITE_ALMACEN = 'almacen';
export const PAYMENT_SITE_APP_MOVIL = 'app_movil';

/** Valor que esta app escribe en todos sus cobros. */
export const MOBILE_PAYMENT_SITE = PAYMENT_SITE_APP_MOVIL;

const PAYMENT_SITE_LABEL: Record<string, string> = {
  [PAYMENT_SITE_ALMACEN]: 'Almacén',
  [PAYMENT_SITE_APP_MOVIL]: 'Aplicación Móvil',
};

/** Etiqueta de los pagos anteriores a esta función, que no tienen sitio. */
export const PAYMENT_SITE_UNSET_LABEL = 'No registrado';

export function paymentSiteLabel(site: string | null | undefined): string {
  if (!site) return PAYMENT_SITE_UNSET_LABEL;
  return PAYMENT_SITE_LABEL[site] || site;
}
