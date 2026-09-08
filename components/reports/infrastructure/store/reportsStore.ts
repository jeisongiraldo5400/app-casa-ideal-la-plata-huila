import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { create } from 'zustand';
import { isNetworkError } from '@/lib/offline/security/sessionPolicy';
import { loadReportSnapshot, saveReportSnapshot } from '@/lib/offline/repositories/offlineRepository';

// Tipos para los resultados de RPC
type PeriodStatsResult = Database['public']['Functions']['get_period_stats']['Returns'][0];
type MovementResult = Database['public']['Functions']['get_movements_by_period']['Returns'][0];

export interface ReportData {
  // Datos de período (entradas vs salidas por día/semana/mes)
  periodStats: {
    period_date: string;
    period_label: string;
    entries_count: number;
    entries_quantity: number;
    exits_count: number;
    exits_quantity: number;
    net_movement: number;
    cancellations_count: number;
  }[];

  // Resumen agregado
  summary: {
    totalEntries: number;
    totalExits: number;
    totalEntriesQuantity: number;
    totalExitsQuantity: number;
    netMovement: number;
    totalCancellations: number;
  };

  // Movimientos recientes (opcional, para detalles)
  recentMovements?: {
    id: string;
    movement_type: string;
    product_name: string;
    warehouse_name: string;
    supplier_name: string;
    quantity: number;
    is_cancelled: boolean;
    created_at: string;
  }[];
}

export interface ExecutiveReport {
  sales_total: number;
  new_businesses: number;
  active_businesses: number;
  cancelled_businesses: number;
  collections_total: number;
  portfolio_balance: number;
  overdue_balance: number;
  overdue_installments: number;
  due_soon_balance: number;
  stock_units: number;
  low_stock_products: number;
  pending_delivery_orders: number;
  inventory_cancellations: number;
}

interface ReportsState {
  loading: boolean;
  error: string | null;
  reportData: ReportData | null;
  executiveReport: ExecutiveReport | null;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  periodType: 'day' | 'week' | 'month';
  setDateRange: (startDate: Date, endDate: Date) => void;
  setPeriodType: (type: 'day' | 'week' | 'month') => void;
  loadReports: (includeMovements?: boolean) => Promise<void>;
  loadExecutiveReport: () => Promise<void>;
  clearError: () => void;
}

export const useReportsStore = create<ReportsState>((set, get) => ({
  loading: false,
  error: null,
  reportData: null,
  executiveReport: null,
  dateRange: {
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // Últimos 30 días
    endDate: new Date(),
  },
  periodType: 'day',

  setDateRange: (startDate: Date, endDate: Date) => {
    set({ dateRange: { startDate, endDate } });
  },

  setPeriodType: (type: 'day' | 'week' | 'month') => {
    set({ periodType: type });
  },

  clearError: () => {
    set({ error: null });
  },

  loadReports: async (includeMovements = false) => {
    set({ loading: true, error: null });

    try {
      const { dateRange, periodType } = get();
      const { startDate, endDate } = dateRange;

      // Validar fechas
      if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Fechas inválidas');
      }

      if (startDate > endDate) {
        throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
      }

      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      // OPTIMIZADO: Usar RPC get_period_stats en lugar de múltiples consultas
      // Esto reduce de ~6-8 consultas a 1-2 consultas
      const statsRequest = supabase.rpc('get_period_stats', {
        start_date: startISO,
        end_date: endISO,
        period_type: periodType,
      });
      const movementsRequest = includeMovements
        ? supabase.rpc('get_movements_by_period', {
            start_date: startISO,
            end_date: endISO,
            movement_limit: 100,
          })
        : null;
      const [{ data: periodStatsData, error: statsError }, movementsResult] = await Promise.all([
        statsRequest,
        movementsRequest,
      ]);

      if (statsError) {
        throw new Error(statsError.message || 'Error al cargar estadísticas');
      }

      if (!periodStatsData || periodStatsData.length === 0) {
        set({
          reportData: {
            periodStats: [],
            summary: {
              totalEntries: 0,
              totalExits: 0,
              totalEntriesQuantity: 0,
              totalExitsQuantity: 0,
              netMovement: 0,
              totalCancellations: 0,
            },
          },
          loading: false,
        });
        return;
      }

      // Calcular resumen agregado
      const summary = (periodStatsData as PeriodStatsResult[]).reduce(
        (acc, period) => ({
          totalEntries: acc.totalEntries + (period.entries_count || 0),
          totalExits: acc.totalExits + (period.exits_count || 0),
          totalEntriesQuantity: acc.totalEntriesQuantity + (period.entries_quantity || 0),
          totalExitsQuantity: acc.totalExitsQuantity + (period.exits_quantity || 0),
          netMovement: acc.netMovement + (period.net_movement || 0),
          totalCancellations: acc.totalCancellations + (period.cancellations_count || 0),
        }),
        {
          totalEntries: 0,
          totalExits: 0,
          totalEntriesQuantity: 0,
          totalExitsQuantity: 0,
          netMovement: 0,
          totalCancellations: 0,
        }
      );

      // Procesar movimientos si se solicitaron
      let recentMovements: ReportData['recentMovements'] = undefined;
      if (includeMovements && movementsResult) {
        const { data: movementsData, error: movementsError } = movementsResult;
        if (!movementsError && movementsData) {
          recentMovements = (movementsData as MovementResult[]).map((m) => ({
            id: m.id,
            movement_type: m.movement_type,
            product_name: m.product_name,
            warehouse_name: m.warehouse_name,
            supplier_name: m.supplier_name || 'N/A',
            quantity: m.quantity,
            is_cancelled: m.is_cancelled,
            created_at: m.created_at,
          }));
        }
      }

      set({
        reportData: {
          periodStats: periodStatsData as PeriodStatsResult[],
          summary,
          recentMovements,
        },
        loading: false,
      });
      await saveReportSnapshot('operational-reports', {
        periodStats: periodStatsData,
        summary,
        recentMovements,
      });
    } catch (error: any) {
      console.error('Error loading reports:', error);
      if (isNetworkError(error)) {
        const snapshot = await loadReportSnapshot<ReportData>('operational-reports');
        if (snapshot) {
          set({ reportData: snapshot.payload, loading: false, error: null });
          return;
        }
      }
      set({
        error: error.message || 'Error al cargar reportes',
        loading: false,
      });
    }
  },

  loadExecutiveReport: async () => {
    try {
      const { dateRange } = get();
      const { data, error } = await supabase.rpc('get_admin_executive_report', {
        p_start_date: dateRange.startDate.toISOString().slice(0, 10),
        p_end_date: dateRange.endDate.toISOString().slice(0, 10),
      });
      if (error) {
        if (isNetworkError(error)) {
          const snapshot = await loadReportSnapshot<ExecutiveReport>('executive-report');
          if (snapshot) {
            set({ executiveReport: snapshot.payload });
            return;
          }
        }
        const context = [error.code, error.details, error.hint].filter(Boolean).join(' · ');
        set({
          error: [error.message || 'Error al cargar el resumen ejecutivo', context]
            .filter(Boolean)
            .join(' · '),
        });
        return;
      }
      set({ executiveReport: data as unknown as ExecutiveReport });
      await saveReportSnapshot('executive-report', data);
    } catch (error: any) {
      if (isNetworkError(error)) {
        const snapshot = await loadReportSnapshot<ExecutiveReport>('executive-report');
        if (snapshot) {
          set({ executiveReport: snapshot.payload });
          return;
        }
      }
      set({ error: error.message || 'Error al cargar el resumen ejecutivo' });
    }
  },
}));
