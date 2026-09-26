import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findSuggestedStopForNegocio,
  readRouteStopState,
} from '@/lib/collection-routes/routeStopContextService';
import { stopStillCurrent, type KnownStopState } from '@/lib/collection-routes/routeStopPago';

type Options = {
  negocioId: string | null | undefined;
  /** `?routeStopId=` con el que se abrió el negocio desde la parada. */
  routeStopIdParam: string | null | undefined;
  online: boolean;
  /** Cambia cuando la pantalla recarga el negocio: se vuelve a comprobar la parada. */
  reloadKey?: unknown;
};

export type RouteStopPago = {
  /** Parada que completará el próximo cobro; null = abono normal. */
  stopId: string | null;
  /** Posición de esa parada en la ruta, si se conoce. */
  position: number | null;
  /** Parada actual de una ruta en curso para este negocio, sin vincular aún. */
  suggestion: KnownStopState | null;
  /** Vincula la sugerencia: el próximo cobro cuenta en la ruta. */
  link: () => void;
  /** Parada que viaja con el cobro, comprobada con lo que sabe el teléfono. */
  resolveForPago: () => Promise<string | null>;
  /** El cobro ya se registró: la parada quedó atendida y no se vuelve a mandar. */
  consume: () => void;
};

/**
 * Contexto de ruta del cobro en el detalle del negocio. Ver
 * `lib/collection-routes/routeStopPago` para las reglas.
 */
export function useRouteStopPago({ negocioId, routeStopIdParam, online, reloadKey }: Options): RouteStopPago {
  const [stopId, setStopId] = useState<string | null>(routeStopIdParam || null);
  const [position, setPosition] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<KnownStopState | null>(null);
  // Parada ya usada por un cobro en esta pantalla: no se vuelve a sugerir.
  const consumedRef = useRef<Set<string>>(new Set());
  const stopIdRef = useRef(stopId);
  stopIdRef.current = stopId;

  // Un parámetro nuevo (otra parada) reemplaza al anterior.
  useEffect(() => {
    if (routeStopIdParam && !consumedRef.current.has(routeStopIdParam)) setStopId(routeStopIdParam);
  }, [routeStopIdParam]);

  // Con cada carga se comprueba que la parada siga siendo la actual; si ya no
  // lo es (cobrada, novedad, ruta cerrada), el cobro será un abono normal.
  useEffect(() => {
    if (!stopId) return;
    let alive = true;
    void readRouteStopState(stopId, online)
      .then((state) => {
        if (!alive) return;
        setPosition(state?.position ?? null);
        if (stopStillCurrent(state) === false) setStopId(null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [stopId, online, reloadKey]);

  // Sin parada: ¿es este negocio la parada actual de la ruta en curso?
  useEffect(() => {
    if (stopId || !negocioId) {
      setSuggestion(null);
      return;
    }
    let alive = true;
    void findSuggestedStopForNegocio(negocioId, online)
      .then((found) => {
        if (alive) setSuggestion(found && !consumedRef.current.has(found.stopId) ? found : null);
      })
      .catch(() => {
        if (alive) setSuggestion(null);
      });
    return () => {
      alive = false;
    };
  }, [stopId, negocioId, online, reloadKey]);

  const link = useCallback(() => {
    if (!suggestion) return;
    setPosition(suggestion.position);
    setStopId(suggestion.stopId);
    setSuggestion(null);
  }, [suggestion]);

  const resolveForPago = useCallback(async () => {
    const current = stopIdRef.current;
    if (!current) return null;
    // Solo lo del teléfono (rápido, sin esperar a la red): si el servidor sabe
    // otra cosa, rechaza la parada y el cobro se repite como abono normal.
    const state = await readRouteStopState(current, false).catch(() => null);
    if (stopStillCurrent(state) === false) {
      setStopId(null);
      return null;
    }
    return current;
  }, []);

  const consume = useCallback(() => {
    const current = stopIdRef.current;
    if (current) consumedRef.current.add(current);
    setStopId(null);
    setSuggestion(null);
  }, []);

  return { stopId, position, suggestion, link, resolveForPago, consume };
}
