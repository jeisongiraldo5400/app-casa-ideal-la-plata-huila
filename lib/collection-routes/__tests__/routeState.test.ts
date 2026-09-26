import {
  countPendingStops,
  getNextActionableStop,
  getRouteOutcomeSummary,
  getRouteProgress,
  groupRoutesForHome,
  isFinalStopStatus,
  isVisitedStopStatus,
  moveItem,
} from '../routeState';
import { CollectionRouteStop } from '../types';

const stop = (id: string, status: CollectionRouteStop['status']): CollectionRouteStop => ({
  id,
  negocio_id: `business-${id}`,
  negocio_numero: Number(id),
  position: Number(id),
  status,
  customer_name: `Cliente ${id}`,
  customer_phone: null,
  customer_address: 'Calle 1',
  municipality_name: 'Medellín',
  expected_balance: 100000,
  payment_id: null,
  payment_amount: null,
  outcome_reason: null,
  notes: null,
  arrived_at: null,
  completed_at: null,
});

describe('routeState', () => {
  it('considera finales todos los resultados de visita', () => {
    expect(isFinalStopStatus('cobrado')).toBe(true);
    expect(isFinalStopStatus('sin_pago')).toBe(true);
    expect(isFinalStopStatus('reprogramado')).toBe(true);
    expect(isFinalStopStatus('omitido')).toBe(true);
    expect(isFinalStopStatus('no_visitada')).toBe(true);
    expect(isFinalStopStatus('actual')).toBe(false);
    expect(isFinalStopStatus('pendiente')).toBe(false);
  });

  it('la no visitada es final pero no cuenta como visita', () => {
    expect(isVisitedStopStatus('no_visitada')).toBe(false);
    expect(isVisitedStopStatus('omitido')).toBe(true);
    expect(getRouteProgress([stop('1', 'cobrado'), stop('2', 'no_visitada')]))
      .toEqual({ completed: 1, total: 2, percentage: 50 });
  });

  it('resume la jornada: visitadas, cobradas, no visitadas y pendientes', () => {
    const stops = [
      stop('1', 'cobrado'), stop('2', 'sin_pago'), stop('3', 'actual'),
      stop('4', 'pendiente'), stop('5', 'no_visitada'),
    ];
    expect(countPendingStops(stops)).toBe(2);
    expect(getRouteOutcomeSummary(stops)).toEqual({ visited: 2, collected: 1, notVisited: 1, pending: 2 });
  });

  it('calcula progreso sin dividir por cero', () => {
    expect(getRouteProgress([])).toEqual({ completed: 0, total: 0, percentage: 0 });
    expect(getRouteProgress([stop('1', 'cobrado'), stop('2', 'actual'), stop('3', 'sin_pago')]))
      .toEqual({ completed: 2, total: 3, percentage: 67 });
  });

  it('prioriza la parada actual y luego la primera pendiente', () => {
    expect(getNextActionableStop([stop('1', 'pendiente'), stop('2', 'actual')])?.id).toBe('2');
    expect(getNextActionableStop([stop('1', 'cobrado'), stop('2', 'pendiente')])?.id).toBe('2');
    expect(getNextActionableStop([stop('1', 'cobrado')])).toBeNull();
  });

  it('reordena sin mutar el arreglo original', () => {
    const original = ['a', 'b', 'c'];
    expect(moveItem(original, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(original).toEqual(['a', 'b', 'c']);
    expect(moveItem(original, -1, 2)).toBe(original);
  });
});


describe('groupRoutesForHome', () => {
  const r = (id: string, route_date: string, status: 'borrador' | 'activa' | 'completada' | 'cancelada') => ({ id, route_date, status });

  it('la ruta de hoy completada se muestra y no se ofrece crear otra', () => {
    const result = groupRoutesForHome([r('hoy', '2026-09-25', 'completada'), r('ayer', '2026-09-24', 'completada')], '2026-09-25');
    expect(result.today?.id).toBe('hoy');
    expect(result.history.map((route) => route.id)).toEqual(['ayer']);
  });

  it('una ruta cancelada hoy permite crear otra', () => {
    const result = groupRoutesForHome([r('hoy', '2026-09-25', 'cancelada')], '2026-09-25');
    expect(result.today).toBeNull();
    expect(result.history.map((route) => route.id)).toEqual(['hoy']);
  });

  it('una ruta de otro día sin cerrar no se hace pasar por la de hoy', () => {
    const result = groupRoutesForHome([r('vieja', '2026-09-23', 'activa'), r('otra', '2026-09-20', 'borrador')], '2026-09-25');
    expect(result.today).toBeNull();
    expect(result.unfinished.map((route) => route.id)).toEqual(['vieja', 'otra']);
    expect(result.history).toEqual([]);
  });
});
