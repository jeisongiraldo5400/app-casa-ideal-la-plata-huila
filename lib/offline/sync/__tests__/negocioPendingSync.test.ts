import { outboxAffectsNegocio } from '../negocioPendingSync';

const command = (type: string, payload: Record<string, unknown>, status = 'pending') => ({ type, status, payload });

describe('outboxAffectsNegocio', () => {
  it('bloquea con un abono pendiente o en reintento del mismo negocio', () => {
    expect(outboxAffectsNegocio([command('register_pago', { negocioId: 'n1' })], { negocioId: 'n1' })).toBe(true);
    expect(outboxAffectsNegocio([command('register_pago', { negocioId: 'n1' }, 'error')], { negocioId: 'n1' })).toBe(true);
    expect(outboxAffectsNegocio([command('register_pago', { negocioId: 'n1' }, 'syncing')], { negocioId: 'n1' })).toBe(true);
  });

  it('no bloquea por comandos terminados, de otros negocios o que no mueven saldo', () => {
    expect(
      outboxAffectsNegocio(
        [
          command('register_pago', { negocioId: 'n1' }, 'done'),
          command('register_pago', { negocioId: 'n1' }, 'failed'),
          command('register_pago', { negocioId: 'n2' }),
          command('attach_pago_support', { negocioId: 'n1', pagoLocalId: 'p1' }),
          command('create_customer', { customerId: 'c1' }),
        ],
        { negocioId: 'n1' }
      )
    ).toBe(false);
  });

  it('cuenta el abono de ruta del negocio aunque viaje por el carril de la ruta', () => {
    expect(
      outboxAffectsNegocio(
        [command('register_route_pago', { negocioId: 'n1', routeId: 'r1', lane: 'route:r1' })],
        { negocioId: 'n1' }
      )
    ).toBe(true);
  });

  it('desde una parada, bloquea con comandos pendientes de esa ruta o de la parada', () => {
    const scope = { negocioId: 'n1', routeId: 'r1', routeStopId: 's1' };
    expect(outboxAffectsNegocio([command('select_route_stop', { stopId: 's1', routeId: 'r1' })], scope)).toBe(true);
    expect(outboxAffectsNegocio([command('start_route', { routeId: 'r1' })], scope)).toBe(true);
    expect(
      outboxAffectsNegocio([command('register_route_pago', { negocioId: 'n9', routeId: 'r1' })], scope)
    ).toBe(true);
    expect(outboxAffectsNegocio([command('start_route', { routeId: 'r2' })], scope)).toBe(false);
  });
});
