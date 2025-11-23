import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';

interface EntriesBySupplierChartProps {
  data: {
    supplierId: string;
    supplierName: string;
    quantity: number;
  }[];
}

const CHART_COLORS = ['#3b82f6', '#60a5fa', '#22c55e', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899', '#14b8a6'];

export function EntriesBySupplierChart({ data }: EntriesBySupplierChartProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const screenWidth = Dimensions.get('window').width;

  if (!data || data.length === 0) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Entradas por Proveedor</Text>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No hay datos disponibles</Text>
      </Card>
    );
  }

  // Preparar datos para el gráfico (top 8)
  const topSuppliers = data.slice(0, 8);
  const totalQuantity = topSuppliers.reduce((sum, item) => sum + item.quantity, 0);

  const pieData = topSuppliers.map((item, index) => ({
    value: item.quantity,
    color: CHART_COLORS[index % CHART_COLORS.length],
    gradientCenterColor: CHART_COLORS[index % CHART_COLORS.length],
    focused: index === 0,
  }));

  return (
    <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Entradas por Proveedor</Text>
      <View style={styles.chartContainer}>
        <PieChart
          data={pieData}
          donut
          radius={80}
          innerRadius={50}
          innerCircleColor={colors.background.paper}
          centerLabelComponent={() => (
            <View style={styles.centerLabel}>
              <Text style={[styles.centerLabelValue, { color: colors.text.primary }]}>
                {topSuppliers.length}
              </Text>
              <Text style={[styles.centerLabelText, { color: colors.text.secondary }]}>Proveedores</Text>
            </View>
          )}
        />
      </View>
      <View style={styles.legend}>
        {topSuppliers.map((item, index) => {
          const percentage = ((item.quantity / totalQuantity) * 100).toFixed(1);
          return (
            <View key={item.supplierId} style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: CHART_COLORS[index % CHART_COLORS.length] },
                ]}
              />
              <View style={styles.legendTextContainer}>
                <Text style={[styles.legendText, { color: colors.text.primary }]} numberOfLines={1}>
                  {item.supplierName}
                </Text>
                <Text style={[styles.legendSubtext, { color: colors.text.secondary }]}>
                  {item.quantity} unidades ({percentage}%)
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabelValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  centerLabelText: {
    fontSize: 12,
  },
  legend: {
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendTextContainer: {
    flex: 1,
  },
  legendText: {
    fontSize: 14,
    fontWeight: '500',
  },
  legendSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

