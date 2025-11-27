import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';

interface DashboardStats {
  entriesToday: number;
  exitsToday: number;
  loading: boolean;
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    entriesToday: 0,
    exitsToday: 0,
    loading: true,
  });

  // Función para obtener el inicio del día en UTC
  const getTodayStart = useCallback(() => {
    const now = new Date();
    // Crear fecha al inicio del día en hora local (medianoche)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    // Convertir a UTC para la consulta
    return today.toISOString();
  }, []);

  // Función para cargar las estadísticas
  const loadStats = useCallback(async () => {
    try {
      // OPTIMIZADO: Usar función RPC para obtener estadísticas del día
      // Esto reduce de 2 consultas a 1 y hace la agregación en el servidor
      const { data, error } = await supabase.rpc('get_reports_stats_today');

      if (error) {
        console.error('Error loading dashboard stats:', error);
        setStats((prev) => ({ ...prev, loading: false }));
        return;
      }

      // La función RPC devuelve un array con un objeto que contiene las estadísticas
      const statsData = data?.[0] || {};

      setStats((prev) => ({
        entriesToday: statsData.entries_quantity_today || 0,
        exitsToday: statsData.exits_quantity_today || 0,
        loading: false,
      }));
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Cargar estadísticas iniciales
    loadStats();

    // Función con debounce para recargar estadísticas
    const debouncedLoadStats = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (isMounted) {
          loadStats();
        }
      }, 800); // Esperar 800ms después del último evento
    };

    // Configurar suscripciones real-time para inventory_entries
    const entriesChannel = supabase
      .channel(`dashboard-entries-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inventory_entries',
        },
        (payload) => {
          console.log('Real-time entry received:', payload);
          // Usar debounce para evitar múltiples recargas cuando se insertan varios registros
          debouncedLoadStats();
        }
      )
      .subscribe((status) => {
        console.log('Entries channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to inventory_entries changes');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Real-time subscription failed for entries');
        }
      });

    // Configurar suscripciones real-time para inventory_exits
    const exitsChannel = supabase
      .channel(`dashboard-exits-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inventory_exits',
        },
        (payload) => {
          console.log('Real-time exit received:', payload);
          // Usar debounce para evitar múltiples recargas cuando se insertan varios registros
          debouncedLoadStats();
        }
      )
      .subscribe((status) => {
        console.log('Exits channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to inventory_exits changes');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Real-time subscription failed for exits');
        }
      });

    // Polling periódico como respaldo (cada 15 segundos)
    const backupPolling = setInterval(() => {
      if (isMounted) {
        loadStats();
      }
    }, 15000);

    // Limpiar suscripciones al desmontar
    return () => {
      isMounted = false;
      console.log('Cleaning up real-time subscriptions');
      entriesChannel.unsubscribe();
      exitsChannel.unsubscribe();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      clearInterval(backupPolling);
    };
  }, [loadStats]);

  return stats;
}


