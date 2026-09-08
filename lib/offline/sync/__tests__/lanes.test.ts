import { planOutboxRun, type LaneItem } from '../lanes';
import { cursorFromServerTime, laneForCommand } from '../types';

function item(overrides: Partial<LaneItem> & { id: string; lane: string }): LaneItem {
  return {
    status: 'pending',
    attempts: 0,
    nextRetryAt: 0,
    queuedAt: 0,
    ...overrides,
  };
}

describe('planOutboxRun', () => {
  const now = 100_000;

  it('envía en orden de encolado los comandos listos', () => {
    const plan = planOutboxRun(
      [item({ id: 'b', lane: 'x', queuedAt: 2 }), item({ id: 'a', lane: 'y', queuedAt: 1 })],
      now
    );
    expect(plan.runnable.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(plan.nextDueAt).toBeNull();
  });

  it('bloquea el carril mientras un comando anterior espera su reintento', () => {
    const plan = planOutboxRun(
      [
        item({ id: 'select', lane: 'route:1', queuedAt: 1, status: 'error', attempts: 1, nextRetryAt: now + 5000 }),
        item({ id: 'pago', lane: 'route:1', queuedAt: 2 }),
        item({ id: 'otro', lane: 'negocio:9', queuedAt: 3 }),
      ],
      now
    );
    expect(plan.runnable.map((entry) => entry.id)).toEqual(['otro']);
    expect(plan.blockedLanes.has('route:1')).toBe(true);
    expect(plan.nextDueAt).toBe(now + 5000);
  });

  it('no deja que un comando terminal bloquee a los siguientes', () => {
    const plan = planOutboxRun(
      [
        item({ id: 'fallido', lane: 'route:1', queuedAt: 1, status: 'failed', attempts: 3 }),
        item({ id: 'siguiente', lane: 'route:1', queuedAt: 2 }),
      ],
      now
    );
    expect(plan.runnable.map((entry) => entry.id)).toEqual(['siguiente']);
  });

  it('omite comandos que agotaron intentos aunque estén vencidos', () => {
    const plan = planOutboxRun(
      [item({ id: 'agotado', lane: 'x', status: 'error', attempts: 8, nextRetryAt: now - 1 })],
      now
    );
    expect(plan.runnable).toEqual([]);
    expect(plan.nextDueAt).toBeNull();
  });
});

describe('laneForCommand', () => {
  it('agrupa los comandos de una misma ruta', () => {
    expect(laneForCommand('start_route', { routeId: 'r1' })).toBe('route:r1');
    expect(laneForCommand('select_route_stop', { stopId: 's1', routeId: 'r1' })).toBe('route:r1');
    expect(laneForCommand('register_route_pago', { negocioId: 'n1', routeId: 'r1' })).toBe('route:r1');
  });

  it('el soporte hereda el carril explícito de su pago', () => {
    expect(laneForCommand('attach_pago_support', { negocioId: 'n1', lane: 'route:r1' })).toBe('route:r1');
    expect(laneForCommand('attach_pago_support', { negocioId: 'n1' })).toBe('negocio:n1');
  });
});

describe('cursorFromServerTime', () => {
  it('retrocede el cursor para cubrir transacciones concurrentes', () => {
    expect(cursorFromServerTime('2026-09-02T10:00:10.000Z', 10_000)).toBe('2026-09-02T10:00:00.000Z');
  });

  it('conserva un valor no parseable', () => {
    expect(cursorFromServerTime('n/a')).toBe('n/a');
  });
});
