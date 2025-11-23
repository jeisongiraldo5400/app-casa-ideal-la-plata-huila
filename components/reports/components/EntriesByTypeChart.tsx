import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';

interface EntriesByTypeChartProps {
  data: {
    type: string;
    quantity: number;
  }[];
}

const TYPE_COLORS: Record<string, string> = {
  PO_ENTRY: '#3b82f6',
  ENTRY: '#22c55e',
  INITIAL_LOAD: '#f59e0b',
};

const TYPE_LABELS: Record<string, string> = {
  PO_ENTRY: 'Orden de Compra',
  ENTRY: 'Entrada Directa',
  INITIAL_LOAD: 'Carga Inicial',
};

export function EntriesByTypeChart({ data }: EntriesByTypeChartProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  if (!data || data.length === 0) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Entradas por Tipo</Text>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No hay datos disponibles</Text>
      </Card>
    );
  }

  const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);

  const pieData = data.map((item) => ({
    value: item.quantity,
    color: TYPE_COLORS[item.type] || colors.primary.main,
    gradientCenterColor: TYPE_COLORS[item.type] || colors.primary.main,
    focused: false,
  }));

  return (
    <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Entradas por Tipo</Text>
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
                {totalQuantity}
              </Text>
              <Text style={[styles.centerLabelText, { color: colors.text.secondary }]}>Total</Text>
            </View>
          )}
        />
      </View>
      <View style={styles.legend}>
        {data.map((item, index) => {
          const percentage = ((item.quantity / totalQuantity) * 100).toFixed(1);
          return (
            <View key={item.type} style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: TYPE_COLORS[item.type] || colors.primary.main },
                ]}
              />
              <View style={styles.legendTextContainer}>
                <Text style={[styles.legendText, { color: colors.text.primary }]}>
                  {TYPE_LABELS[item.type] || item.type}
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

