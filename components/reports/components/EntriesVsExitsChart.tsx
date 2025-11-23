import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';

interface EntriesVsExitsChartProps {
  data: {
    date: string;
    entries: number;
    exits: number;
  }[];
}

export function EntriesVsExitsChart({ data }: EntriesVsExitsChartProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const screenWidth = Dimensions.get('window').width;

  if (!data || data.length === 0) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Entradas vs Salidas</Text>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No hay datos disponibles</Text>
      </Card>
    );
  }

  // Preparar datos para el gráfico
  const chartData = data.map((item, index) => ({
    value: item.entries,
    label: new Date(item.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
    labelTextStyle: { color: colors.text.secondary, fontSize: 10 },
  }));

  const chartDataExits = data.map((item) => ({
    value: item.exits,
  }));

  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.entries, d.exits)),
    1
  );

  return (
    <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Entradas vs Salidas</Text>
      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          data2={chartDataExits}
          height={200}
          width={screenWidth - 80}
          color={colors.success.main}
          color2={colors.error.main}
          thickness={2}
          thickness2={2}
          hideYAxisText={false}
          yAxisColor={colors.divider}
          xAxisColor={colors.divider}
          rulesColor={colors.divider}
          rulesType="solid"
          yAxisTextStyle={{ color: colors.text.secondary, fontSize: 10 }}
          maxValue={maxValue * 1.2}
          spacing={40}
          initialSpacing={10}
          endSpacing={10}
          curved
          areaChart
          areaChart1
          areaChart2
          startFillColor={colors.success.main}
          startFillColor2={colors.error.main}
          endFillColor={colors.success.main + '20'}
          endFillColor2={colors.error.main + '20'}
          startOpacity={0.4}
          endOpacity={0.1}
        />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: colors.success.main }]} />
          <Text style={[styles.legendText, { color: colors.text.secondary }]}>Entradas</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: colors.error.main }]} />
          <Text style={[styles.legendText, { color: colors.text.secondary }]}>Salidas</Text>
        </View>
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
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

