import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useReports } from '@/components/reports';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import {
  EntriesVsExitsChart,
  TopProductsChart,
  EntriesBySupplierChart,
  ExitsByWarehouseChart,
  EntriesByTypeChart,
} from '@/components/reports';

export default function ReportsScreen() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const {
    loading,
    error,
    reportData,
    dateRange,
    setDateRange,
    loadReports,
    clearError,
  } = useReports();

  const [selectedPeriod, setSelectedPeriod] = useState<'7' | '30' | '90' | 'custom'>('30');

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        await loadReports();
      } catch (error) {
        console.error('Error loading reports:', error);
      }
    };
    if (isMounted) {
      loadData();
    }
    return () => {
      isMounted = false;
    };
  }, [dateRange.startDate.getTime(), dateRange.endDate.getTime()]);

  const handlePeriodChange = (period: '7' | '30' | '90' | 'custom') => {
    setSelectedPeriod(period);
    const endDate = new Date();
    let startDate: Date;

    switch (period) {
      case '7':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        return; // Custom date picker would go here
    }

    setDateRange(startDate, endDate);
  };

  const formatDateRange = () => {
    const start = dateRange.startDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const end = dateRange.endDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${start} - ${end}`;
  };

  if (error) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background.default }]}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color={colors.error.main} />
          <Text style={[styles.errorText, { color: colors.error.main }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary.main }]}
            onPress={() => {
              clearError();
              loadReports();
            }}
          >
            <Text style={[styles.retryButtonText, { color: colors.primary.contrastText }]}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading && !!reportData}
          onRefresh={loadReports}
          tintColor={colors.primary.main}
          colors={[colors.primary.main]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Reportes</Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Análisis de inventario y movimientos
        </Text>
      </View>

      <View style={styles.periodSelector}>
        <Text style={[styles.periodLabel, { color: colors.text.secondary }]}>Período:</Text>
        <View style={styles.periodButtons}>
          {(['7', '30', '90'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                {
                  backgroundColor:
                    selectedPeriod === period ? colors.primary.main : colors.background.paper,
                  borderColor: colors.divider,
                },
              ]}
              onPress={() => handlePeriodChange(period)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  {
                    color:
                      selectedPeriod === period
                        ? colors.primary.contrastText
                        : colors.text.primary,
                  },
                ]}
              >
                {period} días
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.dateRangeText, { color: colors.text.secondary }]}>
          {formatDateRange()}
        </Text>
      </View>

      {loading && !reportData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary.main} />
          <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
            Cargando reportes...
          </Text>
        </View>
      ) : (
        <>
          {reportData && (
            <>
              <EntriesVsExitsChart data={reportData.entriesVsExits} />
              <TopProductsChart data={reportData.topProducts} />
              <EntriesBySupplierChart data={reportData.entriesBySupplier} />
              <ExitsByWarehouseChart data={reportData.exitsByWarehouse} />
              <EntriesByTypeChart data={reportData.entriesByType} />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
  },
  periodSelector: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  periodLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  periodButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateRangeText: {
    fontSize: 12,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

