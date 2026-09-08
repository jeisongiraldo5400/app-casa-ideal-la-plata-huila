import { buildPushDeepLink } from '../pushDeepLink';

describe('buildPushDeepLink', () => {
  it('abre el detalle del negocio, que sí tiene pantalla propia', () => {
    expect(buildPushDeepLink({ kind: 'negocio', id: 'n-1', numero: 2026016 })).toBe('/negocio/n-1');
  });

  it('abre las órdenes de entrega filtradas por su número', () => {
    expect(
      buildPushDeepLink({ kind: 'delivery_order', id: 'do-1', order_number: 'OE-2026-0012' })
    ).toBe('/(tabs)/all-orders?tab=delivery&q=OE-2026-0012');
  });

  it('abre las órdenes de compra en su pestaña', () => {
    expect(
      buildPushDeepLink({ kind: 'purchase_order', id: 'po-1', order_number: 'OC-2026-0007' })
    ).toBe('/(tabs)/all-orders?tab=purchase&q=OC-2026-0007');
  });

  it('sin número de orden abre la lista igual, en vez de no hacer nada', () => {
    expect(buildPushDeepLink({ kind: 'delivery_order', id: 'do-1' })).toBe(
      '/(tabs)/all-orders?tab=delivery'
    );
  });

  it('escapa lo que va en la URL', () => {
    expect(buildPushDeepLink({ kind: 'purchase_order', order_number: 'OC 2026/7' })).toBe(
      '/(tabs)/all-orders?tab=purchase&q=OC%202026%2F7'
    );
  });

  it('un negocio sin id no navega a ninguna parte', () => {
    expect(buildPushDeepLink({ kind: 'negocio' })).toBeNull();
    expect(buildPushDeepLink({ kind: 'negocio', id: '   ' })).toBeNull();
  });

  it('un payload desconocido o corrupto devuelve null sin lanzar', () => {
    expect(buildPushDeepLink({ kind: 'otra_cosa', id: 'x' })).toBeNull();
    expect(buildPushDeepLink({})).toBeNull();
    expect(buildPushDeepLink(null)).toBeNull();
    expect(buildPushDeepLink(undefined)).toBeNull();
    expect(buildPushDeepLink({ kind: 42, id: {} } as never)).toBeNull();
  });
});
