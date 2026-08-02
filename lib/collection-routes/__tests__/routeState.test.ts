import { getNextActionableStop, getRouteProgress, isFinalStopStatus, moveItem } from '../routeState';
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
    expect(isFinalStopStatus('actual')).toBe(false);
    expect(isFinalStopStatus('pendiente')).toBe(false);
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

