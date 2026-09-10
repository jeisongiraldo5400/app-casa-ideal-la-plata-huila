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

  it('un recordatorio de varios negocios abre Cartera filtrada por la fecha', () => {
    expect(
      buildPushDeepLink({ kind: 'cartera_vencimientos', due_date: '2026-09-11' })
    ).toBe('/(tabs)/cartera?due=2026-09-11');
  });

  it('el identificador del aviso viaja en la ruta para reaplicar el filtro', () => {
    expect(
      buildPushDeepLink(
        { kind: 'cartera_vencimientos', due_date: '2026-09-11' },
        { nonce: 'abc 1' }
      )
    ).toBe('/(tabs)/cartera?due=2026-09-11&n=abc%201');
  });

  it('un recordatorio sin fecha válida no navega', () => {
    expect(buildPushDeepLink({ kind: 'cartera_vencimientos' })).toBeNull();
    expect(buildPushDeepLink({ kind: 'cartera_vencimientos', due_date: '2026-02-30' })).toBeNull();
    expect(buildPushDeepLink({ kind: 'cartera_vencimientos', due_date: 'mañana' })).toBeNull();
  });

  it('un recordatorio de un solo negocio abre su detalle', () => {
    expect(
      buildPushDeepLink({ kind: 'negocio', id: 'n-9', due_date: '2026-09-11' })
    ).toBe('/negocio/n-9');
  });

  it('un payload desconocido o corrupto devuelve null sin lanzar', () => {
    expect(buildPushDeepLink({ kind: 'otra_cosa', id: 'x' })).toBeNull();
    expect(buildPushDeepLink({})).toBeNull();
    expect(buildPushDeepLink(null)).toBeNull();
    expect(buildPushDeepLink(undefined)).toBeNull();
    expect(buildPushDeepLink({ kind: 42, id: {} } as never)).toBeNull();
  });
});
