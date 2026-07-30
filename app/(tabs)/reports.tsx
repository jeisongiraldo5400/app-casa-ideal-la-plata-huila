import { EntriesVsExitsChart, useReports } from '@/components/reports';
import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui/Card';
import { getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const money = (value: number) => `$${Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

export default function ReportsScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { isAdmin, isBodeguero, loading: loadingRoles } = useUserRoles();
  const { loading, error, reportData, executiveReport, dateRange, periodType, setDateRange, setPeriodType, loadReports, loadExecutiveReport, clearError } = useReports();
  const [selectedPeriod, setSelectedPeriod] = useState<'7' | '30' | '90'>('30');
  const canSeeOperational = isAdmin() || isBodeguero();

  const refresh = async () => {
    if (!canSeeOperational) return;
    await Promise.all([loadReports(false), ...(isAdmin() ? [loadExecutiveReport()] : [])]);
  };

  useEffect(() => {
    if (!loadingRoles) void refresh();
  }, [dateRange.startDate.getTime(), dateRange.endDate.getTime(), periodType, loadingRoles, canSeeOperational]);

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
      <Text style={[styles.title, { color: colors.text.primary }]}>Reportes</Text>
      <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{isAdmin() ? 'Resumen ejecutivo y operación' : 'Control operativo de inventario'}</Text>
      <View style={styles.periods}>{(['7', '30', '90'] as const).map((period) => <TouchableOpacity key={period} onPress={() => handlePeriodChange(period)} style={[styles.period, { borderColor: colors.divider, backgroundColor: selectedPeriod === period ? colors.primary.main : colors.background.paper }]}><Text style={{ color: selectedPeriod === period ? colors.primary.contrastText : colors.text.primary }}>{period} días</Text></TouchableOpacity>)}</View>
      <Text style={[styles.range, { color: colors.text.secondary }]}>{range}</Text>

      {error && <Card style={[styles.error, { borderColor: colors.error.main }]}><Text style={{ color: colors.error.main }}>{error}</Text><TouchableOpacity onPress={() => { clearError(); void refresh(); }}><Text style={{ color: colors.primary.main, fontWeight: '700' }}>Reintentar</Text></TouchableOpacity></Card>}

      {isAdmin() && executiveReport && <>
        <Text style={[styles.section, { color: colors.text.primary }]}>Decisiones de negocio</Text>
        <View style={styles.grid}>
          <Metric color={colors.success.main} label="Ventas activadas" value={money(executiveReport.sales_total)} />
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
  return <Card style={styles.metric}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color }]} numberOfLines={1}>{value}</Text>{detail && <Text style={styles.metricDetail}>{detail}</Text>}</Card>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 20, paddingBottom: 40 }, centered: { alignItems: 'center', flex: 1, gap: 14, justifyContent: 'center', padding: 28 },
  title: { fontSize: 30, fontWeight: '800' }, subtitle: { fontSize: 15, marginTop: 5 }, periods: { flexDirection: 'row', gap: 8, marginTop: 22 }, period: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 9 }, range: { fontSize: 12, marginTop: 10 },
  section: { fontSize: 18, fontWeight: '800', marginBottom: 11, marginTop: 26 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { flexGrow: 1, flexBasis: '45%', minWidth: '45%', padding: 13 }, dot: { borderRadius: 4, height: 7, marginBottom: 9, width: 7 }, metricLabel: { color: '#6B7280', fontSize: 12 }, metricValue: { fontSize: 19, fontWeight: '800', marginTop: 4 }, metricDetail: { color: '#6B7280', fontSize: 11, marginTop: 3 },
  error: { borderWidth: 1, gap: 10, marginTop: 18, padding: 14 }, accessTitle: { fontSize: 20, fontWeight: '800' }, accessText: { fontSize: 14, textAlign: 'center' },
});
