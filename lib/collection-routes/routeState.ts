import { CollectionRouteStop, StopStatus } from './types';

export const FINAL_STOP_STATUSES: StopStatus[] = ['cobrado', 'sin_pago', 'reprogramado', 'omitido'];

export function isFinalStopStatus(status: StopStatus) {
  return FINAL_STOP_STATUSES.includes(status);
}

export function getRouteProgress(stops: CollectionRouteStop[]) {
  const completed = stops.filter((stop) => isFinalStopStatus(stop.status)).length;
  return {
    completed,
    total: stops.length,
    percentage: stops.length ? Math.round((completed / stops.length) * 100) : 0,
  };
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function getNextActionableStop(stops: CollectionRouteStop[]) {
  return stops.find((stop) => stop.status === 'actual') || stops.find((stop) => stop.status === 'pendiente') || null;
}

