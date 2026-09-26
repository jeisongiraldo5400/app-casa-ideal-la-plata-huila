import {
  isStopNoLongerCurrentError,
  pickSuggestedStop,
  stopStatesFromRoute,
  stopStillCurrent,
  type KnownStopState,
} from '../routeStopPago';
import type { CollectionRoute } from '../types';

const state = (overrides: Partial<KnownStopState>): KnownStopState => ({
  stopId: 's1',
  routeId: 'r1',
  negocioId: 'n1',
  position: 1,
  stopStatus: 'actual',
  routeStatus: 'activa',
  routeDate: '2026-09-25',
  ...overrides,
});

describe('isStopNoLongerCurrentError', () => {
  it('reconoce el rechazo del servidor por parada que ya no es la actual', () => {
    expect(isStopNoLongerCurrentError({ message: 'Solo puede cobrarse la parada actual' })).toBe(true);
    expect(isStopNoLongerCurrentError(new Error('solo puede cobrarse la parada actual'))).toBe(true);
  });
  it('otros errores no', () => {
    expect(isStopNoLongerCurrentError({ message: 'El valor supera el saldo' })).toBe(false);
    expect(isStopNoLongerCurrentError(null)).toBe(false);
  });
});

describe('stopStillCurrent', () => {
  it('solo la parada «actual» de una ruta en curso cuenta el cobro', () => {
    expect(stopStillCurrent(state({}))).toBe(true);
    expect(stopStillCurrent(state({ stopStatus: 'cobrado' }))).toBe(false);
    expect(stopStillCurrent(state({ stopStatus: 'sin_pago' }))).toBe(false);
    expect(stopStillCurrent(state({ routeStatus: 'completada' }))).toBe(false);
  });
  it('sin datos no se sabe: decide el servidor', () => {
    expect(stopStillCurrent(null)).toBeNull();
    expect(stopStillCurrent(state({ routeStatus: null }))).toBe(true);
  });
});

describe('pickSuggestedStop', () => {
  it('ofrece la parada actual de la ruta en curso del negocio', () => {
    expect(pickSuggestedStop([state({})], 'n1', '2026-09-25')?.stopId).toBe('s1');
  });
  it('no ofrece paradas atendidas, de otro negocio, de rutas sin iniciar o de días futuros', () => {
    expect(pickSuggestedStop([state({ stopStatus: 'cobrado' })], 'n1', '2026-09-25')).toBeNull();
    expect(pickSuggestedStop([state({ negocioId: 'n2' })], 'n1', '2026-09-25')).toBeNull();
    expect(pickSuggestedStop([state({ routeStatus: 'borrador' })], 'n1', '2026-09-25')).toBeNull();
    expect(pickSuggestedStop([state({ routeDate: '2026-09-26' })], 'n1', '2026-09-25')).toBeNull();
  });
  it('con varias rutas abiertas, la más reciente', () => {
    const picked = pickSuggestedStop(
      [state({ stopId: 'vieja', routeDate: '2026-09-20' }), state({ stopId: 'hoy', routeDate: '2026-09-25' })],
      'n1',
      '2026-09-25'
    );
    expect(picked?.stopId).toBe('hoy');
  });
});

it('stopStatesFromRoute lleva el estado de la ruta a cada parada', () => {
  const route = {
    id: 'r1',
    status: 'activa',
    route_date: '2026-09-25',
    stops: [{ id: 's1', negocio_id: 'n1', position: 3, status: 'actual' }],
  } as unknown as CollectionRoute;
  expect(stopStatesFromRoute(route)).toEqual([state({ position: 3 })]);
  expect(stopStatesFromRoute(null)).toEqual([]);
});
