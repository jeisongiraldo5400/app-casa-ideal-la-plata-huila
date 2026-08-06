import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';

interface DashboardStats {
  entriesToday: number;
  exitsToday: number;
  pendingOrders: number;
  pendingDeliveryOrders: number;
  loading: boolean;
}

const DASHBOARD_CHANNEL = 'dashboard-inventory-stats';

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>({
    entriesToday: 0,
    exitsToday: 0,
    pendingOrders: 0,
    pendingDeliveryOrders: 0,
    loading: true,
  });

  const loadStats = useCallback(async () => {
    try {
      const [statsResult, purchaseOrdersResult, deliveryOrdersResult] = await Promise.all([
        supabase.rpc('get_reports_stats_today'),
        supabase.rpc('get_purchase_orders_stats'),
        supabase.rpc('get_delivery_orders_stats'),
      ]);

      if (statsResult.error || purchaseOrdersResult.error || deliveryOrdersResult.error) {
        console.warn('No se pudieron actualizar todos los indicadores del inicio');
      }

      const statsData = statsResult.data?.[0] || {};
      const purchaseOrdersData = purchaseOrdersResult.data?.[0] || {};
      const deliveryOrdersData = deliveryOrdersResult.data?.[0] || {};

      setStats({
        entriesToday: statsData.entries_quantity_today || 0,
        exitsToday: statsData.exits_quantity_today || 0,
        pendingOrders: purchaseOrdersData.pending || 0,
        pendingDeliveryOrders: deliveryOrdersData.pending_orders || 0,
        loading: false,
      });
    } catch {
      setStats((previous) => ({ ...previous, loading: false }));
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    void loadStats();

    const refreshAfterChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isActive) void loadStats();
      }, 800);
    };

    for (const existingChannel of supabase.getChannels()) {
      if (existingChannel.topic === `realtime:${DASHBOARD_CHANNEL}`) {
        void supabase.removeChannel(existingChannel);
      }
    }

    const inventoryChannel = supabase
      .channel(DASHBOARD_CHANNEL)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_entries' }, refreshAfterChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_exits' }, refreshAfterChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_entry_cancellations' }, refreshAfterChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_exit_cancellations' }, refreshAfterChange)
      .subscribe((status, error) => {
        if (!isActive || status === 'SUBSCRIBED' || status === 'CLOSED') return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('La sincronización en tiempo real no está disponible; se usarán actualizaciones periódicas.', error?.message || status);
        }
      });

    const backupPolling = setInterval(() => {
      if (isActive) void loadStats();
    }, 60000);

    return () => {
      isActive = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(backupPolling);
      void supabase.removeChannel(inventoryChannel);
    };
  }, [loadStats]);

  return stats;
}
