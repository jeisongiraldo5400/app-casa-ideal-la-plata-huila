import {
  MOBILE_PAYMENT_SITE,
  PAYMENT_SITE_ALMACEN,
  PAYMENT_SITE_APP_MOVIL,
  PAYMENT_SITE_UNSET_LABEL,
  paymentSiteLabel,
} from '../paymentSite';

describe('sitio de pago', () => {
  it('la app móvil siempre escribe app_movil (mismo valor que acepta el CHECK de la BD)', () => {
    expect(MOBILE_PAYMENT_SITE).toBe('app_movil');
    expect(PAYMENT_SITE_APP_MOVIL).toBe('app_movil');
    expect(PAYMENT_SITE_ALMACEN).toBe('almacen');
  });

  it('traduce los dos sitios conocidos a su etiqueta', () => {
    expect(paymentSiteLabel('almacen')).toBe('Almacén');
    expect(paymentSiteLabel('app_movil')).toBe('Aplicación Móvil');
  });

  it('los pagos anteriores a la función (sin sitio) se muestran como «No registrado»', () => {
    expect(paymentSiteLabel(null)).toBe(PAYMENT_SITE_UNSET_LABEL);
    expect(paymentSiteLabel(undefined)).toBe('No registrado');
    expect(paymentSiteLabel('')).toBe('No registrado');
  });

  it('un valor desconocido se muestra tal cual en vez de ocultarse', () => {
    expect(paymentSiteLabel('otro_canal')).toBe('otro_canal');
  });
});
