import { ExitsList } from '@/components/exits-list/components/ExitsList';
import { ExitsSearchBar } from '@/components/exits-list/components/ExitsSearchBar';
import { exitsListSubtitle } from '@/components/exits-list/utils/exitsListSubtitle';
import { useExitsList } from '@/components/exits-list/infrastructure/hooks/useExitsList';
import { useTheme } from '@/components/theme';
import { ScreenHeader } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import { useScreenLoading } from '@/hooks/useScreenLoading';
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function ExitsListScreen() {
  return (
    <ScreenErrorBoundary screen="Historial de salidas">
      <ExitsListScreenInner />
    </ScreenErrorBoundary>
  );
}

function ExitsListScreenInner() {
  const { loadExits, loading, exits, error, totalCount } = useExitsList();
  // Publica la carga de esta pantalla al aviso global (components/ui/GlobalLoadingBar).
  useScreenLoading(loading);

  const { isDark } = useTheme();
  const colors = getColors(isDark);

  // Única carga al abrir; la búsqueda y «Cargar más» cargan por su cuenta.
  useEffect(() => {
    void loadExits();
  }, [loadExits]);

  const handleRefresh = () => {
    loadExits();
  };

  // Con la consulta caída no hay "0 registros" que contar: no se sabe cuántos hay.
  const subtitle = error && exits.length === 0
    ? 'No se pudo consultar el historial'
    : exitsListSubtitle(exits, totalCount);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <ScreenHeader icon="local-shipping" iconColor={colors.error.main} title="Salidas" subtitle={subtitle} />

      <ExitsSearchBar />

      <ExitsList />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
});
