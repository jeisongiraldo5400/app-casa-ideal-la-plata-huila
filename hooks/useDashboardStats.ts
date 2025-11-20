import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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
  const getTodayStart = () => {
    const now = new Date();
    // Crear fecha al inicio del día en hora local
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Convertir a UTC para la consulta
    return today.toISOString();
  };

  // Función para cargar las estadísticas
  const loadStats = async () => {
    try {
      const todayStart = getTodayStart();

      // Contar entradas del día
      const { count: entriesCount, error: entriesError } = await supabase
        .from('inventory_entries')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart);

      // Contar salidas del día
      const { count: exitsCount, error: exitsError } = await supabase
        .from('inventory_exits')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart);

      if (entriesError) {
        console.error('Error loading entries count:', entriesError);
      }

      if (exitsError) {
        console.error('Error loading exits count:', exitsError);
      }

      setStats({
        entriesToday: entriesCount || 0,
        exitsToday: exitsCount || 0,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    // Cargar estadísticas iniciales
    loadStats();

    // Configurar suscripciones real-time para inventory_entries
    const entriesChannel = supabase
      .channel('dashboard-entries')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Solo escuchar inserciones nuevas
          schema: 'public',
          table: 'inventory_entries',
        },
        (payload: any) => {
          // Verificar si el registro es del día de hoy
          if (payload.new?.created_at) {
            const recordDate = new Date(payload.new.created_at);
            const todayStart = new Date(getTodayStart());
            if (recordDate >= todayStart) {
              // Recargar estadísticas cuando hay cambios del día
              loadStats();
            }
          }
        }
      )
      .subscribe();

    // Configurar suscripciones real-time para inventory_exits
    const exitsChannel = supabase
      .channel('dashboard-exits')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Solo escuchar inserciones nuevas
          schema: 'public',
          table: 'inventory_exits',
        },
        (payload: any) => {
          // Verificar si el registro es del día de hoy
          if (payload.new?.created_at) {
            const recordDate = new Date(payload.new.created_at);
            const todayStart = new Date(getTodayStart());
            if (recordDate >= todayStart) {
              // Recargar estadísticas cuando hay cambios del día
              loadStats();
            }
          }
        }
      )
      .subscribe();

    // Limpiar suscripciones al desmontar
    return () => {
      supabase.removeChannel(entriesChannel);
      supabase.removeChannel(exitsChannel);
    };
  }, []);

  return stats;
}

