import { EntriesVsExitsChart, useReports } from '@/components/reports';
import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const money = (value: number) => `$${Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

export default function ReportsScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isBodeguero, loading: loadingRoles } = useUserRoles();
  const { loading, error, reportData, executiveReport, dateRange, periodType, setDateRange, setPeriodType, loadReports, loadExecutiveReport, clearError } = useReports();
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const online = useSyncStore((state) => state.online);
  const [selectedPeriod, setSelectedPeriod] = useState<'7' | '30' | '90'>('30');
  const canSeeExecutive = isAdmin();
  const canSeeOperational = canSeeExecutive || isBodeguero();
  const periodStartTimestamp = dateRange.startDate.getTime();
  const periodEndTimestamp = dateRange.endDate.getTime();

  const refresh = useCallback(async () => {
    if (!canSeeOperational) return;
    await Promise.all([loadReports(false), ...(canSeeExecutive ? [loadExecutiveReport()] : [])]);
  }, [canSeeExecutive, canSeeOperational, loadExecutiveReport, loadReports]);

  useEffect(() => {
    if (!loadingRoles) void refresh();
  }, [periodStartTimestamp, periodEndTimestamp, periodType, loadingRoles, refresh]);

  const handlePeriodChange = (period: '7' | '30' | '90') => {
    setSelectedPeriod(period);
    const endDate = new Date();
    const days = Number(period);
    setPeriodType(period === '90' ? 'week' : 'day');
    setDateRange(new Date(endDate.getTime() - (days - 1) * 86400000), endDate);
  };

  const chartData = useMemo(() => reportData?.periodStats.map((period) => ({ date: period.period_date, entries: period.entries_quantity, exits: period.exits_quantity })) ?? [], [reportData]);
  const range = `${dateRange.startDate.toLocaleDateString('es-CO')} – ${dateRange.endDate.toLocaleDateString('es-CO')}`;

  if (loadingRoles || (loading && !reportData)) return <View style={[styles.centered, { backgroundColor: colors.background.default }]}><ActivityIndicator color={colors.primary.main} size="large" /><Text style={{ color: colors.text.secondary }}>Cargando reportes…</Text></View>;

  if (!canSeeOperational) return (
    <View style={[styles.centered, { backgroundColor: colors.background.default }]}>
      <MaterialIcons name="lock-outline" size={44} color={colors.text.secondary} />
      <Text style={[styles.accessTitle, { color: colors.text.primary }]}>Reportes restringidos</Text>
      <Text style={[styles.accessText, { color: colors.text.secondary }]}>Esta información está disponible para administración y bodega.</Text>
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background.default }]} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} colors={[colors.primary.main]} />}>
      <Text style={[styles.description, { color: colors.text.secondary }]}>{canSeeExecutive ? 'Resumen ejecutivo y operación' : 'Control operativo de inventario'}</Text>
      {!online || lastSyncedAt ? (
        <Text style={[styles.range, { color: colors.text.secondary }]}>
          {online
            ? lastSyncedAt
              ? `Datos al ${new Date(lastSyncedAt).toLocaleString('es-CO', { hour12: true })}`
              : ''
            : `Sin conexión${lastSyncedAt ? ` · último corte ${new Date(lastSyncedAt).toLocaleString('es-CO', { hour12: true })}` : ''}`}
        </Text>
      ) : null}
      <View style={styles.periods}><SegmentedControl value={selectedPeriod} onChange={(value) => handlePeriodChange(value as '7' | '30' | '90')} items={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }]} /></View>
      <Text style={[styles.range, { color: colors.text.secondary }]}>{range}</Text>

      {error && <Card style={[styles.error, { borderColor: colors.error.main }]}><Text style={{ color: colors.error.main }}>{error}</Text><TouchableOpacity onPress={() => { clearError(); void refresh(); }}><Text style={{ color: colors.primary.main, fontWeight: '700' }}>Reintentar</Text></TouchableOpacity></Card>}

      {canSeeExecutive && executiveReport && <>
        <Text style={[styles.section, { color: colors.text.primary }]}>Decisiones de negocio</Text>
        <View style={styles.grid}>
          <Metric color={colors.success.main} label="Negocios a crédito" value={money(executiveReport.sales_total)} />
          <Metric color={colors.primary.main} label="Recaudo período" value={money(executiveReport.collections_total)} />
          <Metric color={colors.warning.main} label="Cartera vencida" value={money(executiveReport.overdue_balance)} detail={`${executiveReport.overdue_installments} cuotas`} />
          <Metric color={colors.info.main} label="Saldo cartera" value={money(executiveReport.portfolio_balance)} />
        </View>
        <View style={styles.grid}>
          <Metric color={colors.primary.main} label="Negocios nuevos" value={String(executiveReport.new_businesses)} detail={`${executiveReport.active_businesses} activos`} />
          <Metric color={colors.warning.main} label="Por vencer (15 días)" value={money(executiveReport.due_soon_balance)} />
          <Metric color={colors.error.main} label="Negocios anulados" value={String(executiveReport.cancelled_businesses)} />
          <Metric color={colors.error.main} label="Anulaciones inventario" value={String(executiveReport.inventory_cancellations)} />
        </View>
        <Text style={[styles.section, { color: colors.text.primary }]}>Alertas operativas</Text>
        <View style={styles.grid}>
          <Metric color={colors.info.main} label="Unidades en stock" value={Number(executiveReport.stock_units).toLocaleString('es-CO')} />
          <Metric color={colors.warning.main} label="Productos con stock bajo" value={String(executiveReport.low_stock_products)} />
          <Metric color={colors.warning.main} label="Órdenes por despachar" value={String(executiveReport.pending_delivery_orders)} />
        </View>
      </>}

      <Text style={[styles.section, { color: colors.text.primary }]}>Movimiento de inventario</Text>
      {reportData?.summary && <View style={styles.grid}>
        <Metric color={colors.success.main} label="Entradas" value={Number(reportData.summary.totalEntriesQuantity).toLocaleString('es-CO')} detail={`${reportData.summary.totalEntries} registros`} />
        <Metric color={colors.error.main} label="Salidas" value={Number(reportData.summary.totalExitsQuantity).toLocaleString('es-CO')} detail={`${reportData.summary.totalExits} registros`} />
        <Metric color={reportData.summary.netMovement >= 0 ? colors.success.main : colors.error.main} label="Movimiento neto" value={`${reportData.summary.netMovement >= 0 ? '+' : ''}${Number(reportData.summary.netMovement).toLocaleString('es-CO')}`} />
      </View>}
      <EntriesVsExitsChart data={chartData} />
    </ScrollView>
  );
}

function Metric({ label, value, detail, color }: { label: string; value: string; detail?: string; color: string }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return <Card style={styles.metric}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{label}</Text><Text style={[styles.metricValue, { color }]} numberOfLines={1}>{value}</Text>{detail && <Text style={[styles.metricDetail, { color: colors.text.secondary }]}>{detail}</Text>}</Card>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: Spacing.xl, paddingBottom: 40 }, centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  description: { fontSize: 14 }, periods: { marginTop: Spacing.xl }, range: { fontSize: 12, marginTop: 10 },
  section: { fontSize: 18, fontWeight: '800', marginBottom: 16, marginTop: 30 }, grid: { columnGap: 20, flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 }, metric: { elevation: 1, flexGrow: 1, flexBasis: '44%', marginBottom: 2, minWidth: '44%', padding: 14, shadowOpacity: 0.04, shadowRadius: 4 }, dot: { borderRadius: 4, height: 7, marginBottom: 9, width: 7 }, metricLabel: { fontSize: 12 }, metricValue: { fontSize: 19, fontWeight: '800', marginTop: 4 }, metricDetail: { fontSize: 11, marginTop: 3 },
  error: { borderWidth: 1, gap: 10, marginTop: 18, padding: 14 }, accessTitle: { fontSize: 20, fontWeight: '800' }, accessText: { fontSize: 14, textAlign: 'center' },
});
