import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';

interface ExitsByWarehouseChartProps {
  data: {
    warehouseId: string;
    warehouseName: string;
    quantity: number;
  }[];
}

export function ExitsByWarehouseChart({ data }: ExitsByWarehouseChartProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const screenWidth = Dimensions.get('window').width;

  if (!data || data.length === 0) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Salidas por Bodega</Text>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No hay datos disponibles</Text>
      </Card>
    );
  }

  // Preparar datos para el gráfico
  const chartData = data.map((item, index) => ({
    value: item.quantity,
    label: item.warehouseName.length > 10 ? item.warehouseName.substring(0, 10) + '...' : item.warehouseName,
    labelTextStyle: { color: colors.text.secondary, fontSize: 10 },
    frontColor: colors.error.main,
    topLabelComponent: () => (
      <Text style={{ color: colors.text.primary, fontSize: 10, fontWeight: '600' }}>
        {item.quantity}
      </Text>
    ),
  }));

  const maxValue = Math.max(...data.map((d) => d.quantity), 1);

  return (
    <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Salidas por Bodega</Text>
      <View style={styles.chartContainer}>
        <BarChart
          data={chartData}
          width={screenWidth - 80}
          height={250}
          barWidth={Math.max(30, (screenWidth - 120) / data.length - 10)}
          spacing={10}
          roundedTop
          roundedBottom
          hideRules
          xAxisThickness={1}
          yAxisThickness={1}
          xAxisColor={colors.divider}
          yAxisColor={colors.divider}
          yAxisTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
          maxValue={maxValue * 1.2}
          noOfSections={4}
          isAnimated
          animationDuration={800}
        />
      </View>
      <View style={styles.detailsContainer}>
        {data.map((item, index) => (
          <View key={item.warehouseId} style={styles.detailItem}>
            <Text style={[styles.detailName, { color: colors.text.primary }]}>{item.warehouseName}</Text>
            <Text style={[styles.detailValue, { color: colors.error.main }]}>{item.quantity} unidades</Text>
          </View>
        ))}
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
    marginVertical: 8,
  },
  detailsContainer: {
    marginTop: 16,
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailName: {
    fontSize: 14,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

