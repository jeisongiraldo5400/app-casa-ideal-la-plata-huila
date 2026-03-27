import React from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';

interface TopProductsChartProps {
  data: {
    productId: string;
    productName: string;
    entries: number;
    exits: number;
    total: number;
  }[];
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const screenWidth = Dimensions.get('window').width;

  if (!data || data.length === 0) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Productos Más Movidos</Text>
        <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No hay datos disponibles</Text>
      </Card>
    );
  }

  // Preparar datos para el gráfico con validación
  const chartData = data
    .filter((item) => item && item.productId && item.productName)
    .map((item, index) => ({
      value: Number(item.total) || 0,
      label: (item.productName || '').length > 15 ? (item.productName || '').substring(0, 15) + '...' : (item.productName || ''),
      labelTextStyle: { color: colors.text.secondary, fontSize: 9 },
      frontColor: colors.primary.main,
      topLabelComponent: () => (
        <Text style={{ color: colors.text.primary, fontSize: 10, fontWeight: '600' }}>
          {Number(item.total) || 0}
        </Text>
      ),
    }));

  const maxValue = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <Card style={[styles.card, { backgroundColor: colors.background.paper }]}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Top 10 Productos Más Movidos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartContainer}>
          <BarChart
            data={chartData}
            width={Math.max(screenWidth - 80, data.length * 60)}
            height={250}
            barWidth={40}
            spacing={20}
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
      </ScrollView>
      <View style={styles.detailsContainer}>
        {data.slice(0, 5).map((item, index) => (
          <View key={item.productId} style={styles.detailItem}>
            <Text style={[styles.detailRank, { color: colors.text.secondary }]}>{index + 1}.</Text>
            <Text style={[styles.detailName, { color: colors.text.primary }]} numberOfLines={1}>
              {item.productName}
            </Text>
            <Text style={[styles.detailValue, { color: colors.primary.main }]}>{item.total} unidades</Text>
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
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  detailRank: {
    fontSize: 14,
    fontWeight: '600',
    width: 24,
  },
  detailName: {
    flex: 1,
    fontSize: 14,
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

