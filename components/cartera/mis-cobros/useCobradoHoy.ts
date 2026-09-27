import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { initialMisCobrosFilters } from '@/lib/cartera/misCobros';
import { fetchMisCobros } from '@/lib/cartera/misCobrosService';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export type CobradoHoy = { total: number; count: number };

/**
 * Lo que la persona cobró hoy (sus pagos vigentes), para verlo de un vistazo
 * desde Cartera sin entrar a «Cobros». Es la misma consulta con la que abre
 * esa pantalla, así que sin señal usa los pagos del teléfono. Se recarga al
 * volver a la pestaña: un cobro recién registrado ya cuenta.
 */
export function useCobradoHoy(enabled: boolean): CobradoHoy | null {
  const { user } = useAuth();
  const online = useSyncStore((state) => state.online);
  const [value, setValue] = useState<CobradoHoy | null>(null);
  const userId = user?.id ?? '';

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return undefined;
      let alive = true;
      void fetchMisCobros({
        filters: { ...initialMisCobrosFilters(), status: 'vigentes' },
        page: 1,
        pageSize: 1,
        collectorId: userId,
        collectorName: null,
        isSelf: true,
        online,
        scope: 'performed',
      })
        .then((result) => {
          if (alive) setValue({ total: result.summary.total_collected, count: result.summary.valid_count });
        })
        // Es un resumen de cortesía: si falla, el botón queda con su texto de siempre.
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [enabled, online, userId])
  );

  return enabled ? value : null;
}
