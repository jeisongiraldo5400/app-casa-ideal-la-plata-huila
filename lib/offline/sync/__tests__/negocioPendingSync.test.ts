import { buildNegocioSyncStateMap, discardedNegocioIds, outboxAffectsNegocio } from '../negocioPendingSync';

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

describe('buildNegocioSyncStateMap', () => {
  it('marca pendiente lo que sigue en cola y rechazado lo que el servidor no aceptó', () => {
    const states = buildNegocioSyncStateMap(
      [
        command('create_negocio', { negocioId: 'n1' }),
        command('create_negocio', { negocioId: 'n2' }, 'syncing'),
        command('create_negocio', { negocioId: 'n3' }, 'error'),
        command('create_negocio', { negocioId: 'n4' }, 'failed'),
        command('create_negocio', { negocioId: 'n5' }, 'conflict'),
      ],
      []
    );
    expect(states).toEqual({ n1: 'pending', n2: 'pending', n3: 'pending', n4: 'rejected', n5: 'rejected' });
  });

  it('ignora otros comandos aunque apunten al negocio', () => {
    expect(
      buildNegocioSyncStateMap(
        [command('register_pago', { negocioId: 'n1' }, 'failed'), command('upload_negocio_signature', { negocioId: 'n1' })],
        []
      )
    ).toEqual({});
  });

  it('sin comando en la cola usa la fila local', () => {
    expect(
      buildNegocioSyncStateMap([], [
        { id: 'n1', rowSyncStatus: 'pending' },
        { id: 'n2', rowSyncStatus: 'rejected' },
        { id: 'n3', rowSyncStatus: 'synced' },
      ])
    ).toEqual({ n1: 'pending', n2: 'rejected' });
  });

  it('la cola manda sobre la fila: tras «Reintentar» vuelve a pendiente, y confirmado desaparece', () => {
    expect(
      buildNegocioSyncStateMap(
        [command('create_negocio', { negocioId: 'n1' }), command('create_negocio', { negocioId: 'n2' }, 'done')],
        [
          { id: 'n1', rowSyncStatus: 'rejected' },
          { id: 'n2', rowSyncStatus: 'pending' },
        ]
      )
    ).toEqual({ n1: 'pending' });
  });
});

describe('negocios descartados por el usuario', () => {
  it('no salen en el mapa aunque la fila local quede marcada como rechazada', () => {
    expect(
      buildNegocioSyncStateMap(
        [command('create_negocio', { negocioId: 'n1' }, 'discarded'), command('create_negocio', { negocioId: 'n2' }, 'failed')],
        [
          { id: 'n1', rowSyncStatus: 'rejected' },
          { id: 'n2', rowSyncStatus: 'rejected' },
        ]
      )
    ).toEqual({ n2: 'rejected' });
  });

  it('discardedNegocioIds solo cuenta creaciones descartadas sin otra viva', () => {
    const ids = discardedNegocioIds([
      command('create_negocio', { negocioId: 'n1' }, 'discarded'),
      command('create_negocio', { negocioId: 'n2' }, 'discarded'),
      command('create_negocio', { negocioId: 'n2' }, 'pending'),
      command('register_pago', { negocioId: 'n3' }, 'discarded'),
    ]);
    expect([...ids]).toEqual(['n1']);
  });
});
