import { evaluateRouteOfflineStatus, routeOfflineLabel } from '../routeOffline';

const server = [
  { negocio_id: 'n1', negocio_numero: 20260001 },
  { negocio_id: 'n2', negocio_numero: 20260002 },
];

describe('evaluateRouteOfflineStatus', () => {
  it('ruta que no está en el teléfono', () => {
    const status = evaluateRouteOfflineStatus({
      serverStops: server,
      local: { routeExists: false, stopNegocioIds: [], readyNegocioIds: new Set() },
      downloadedAt: null,
    });
    expect(status.state).toBe('no_guardada');
    expect(routeOfflineLabel(status)).toBe('Pendiente de descargar: la ruta no está en el teléfono');
  });

  it('guardada: mismas paradas y todos sus negocios en el teléfono', () => {
    const now = new Date(2026, 8, 25, 15, 0).getTime();
    const downloadedAt = new Date(2026, 8, 25, 9, 5).getTime();
    const status = evaluateRouteOfflineStatus({
      serverStops: server,
      local: { routeExists: true, stopNegocioIds: ['n1', 'n2'], readyNegocioIds: new Set(['n1', 'n2']) },
      downloadedAt,
    });
    expect(status.state).toBe('guardada');
    expect(routeOfflineLabel(status, now)).toMatch(/^Guardada en el teléfono · /);
  });

  it('pendiente si la ruta cambió (paradas agregadas o reordenadas)', () => {
    const reordered = evaluateRouteOfflineStatus({
      serverStops: [...server].reverse(),
      local: { routeExists: true, stopNegocioIds: ['n1', 'n2'], readyNegocioIds: new Set(['n1', 'n2']) },
      downloadedAt: 1,
    });
    expect(reordered.state).toBe('pendiente');
    expect(reordered.structureChanged).toBe(true);
    expect(routeOfflineLabel(reordered)).toBe('Pendiente de descargar: la ruta cambió después de guardarla');

    const added = evaluateRouteOfflineStatus({
      serverStops: server,
      local: { routeExists: true, stopNegocioIds: ['n1'], readyNegocioIds: new Set(['n1']) },
      downloadedAt: 1,
    });
    expect(added.state).toBe('pendiente');
  });

  it('pendiente si a una parada le falta su negocio en el teléfono', () => {
    const status = evaluateRouteOfflineStatus({
      serverStops: server,
      local: { routeExists: true, stopNegocioIds: ['n1', 'n2'], readyNegocioIds: new Set(['n1']) },
      downloadedAt: 1,
    });
    expect(status.state).toBe('pendiente');
    expect(status.missingNegocioNumeros).toEqual([20260002]);
    expect(routeOfflineLabel(status)).toBe('Pendiente de descargar: 1 parada sin datos en el teléfono');
  });

  it('sin señal se juzga solo con lo local', () => {
    const status = evaluateRouteOfflineStatus({
      serverStops: null,
      local: { routeExists: true, stopNegocioIds: ['n1', 'n2'], readyNegocioIds: new Set(['n1', 'n2']) },
      downloadedAt: 1,
    });
    expect(status.state).toBe('guardada');
    expect(status.structureChanged).toBe(false);
  });
});
