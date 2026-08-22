import { ExitsList } from '@/components/exits-list/components/ExitsList';
import { ExitsSearchBar } from '@/components/exits-list/components/ExitsSearchBar';
import { useExitsList } from '@/components/exits-list/infrastructure/hooks/useExitsList';
import { useTheme } from '@/components/theme';
import { ScreenHeader } from '@/components/ui';
import { Spacing, getColors } from '@/constants/theme';
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ExitsListScreen() {
  const { loadExits, loading, exits } = useExitsList();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  useEffect(() => {
    loadExits();
  }, [loadExits]);

  const handleRefresh = () => {
    loadExits();
  };

  const totalItems = exits.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background.default }]} edges={['top']}>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.default }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <ScreenHeader icon="local-shipping" iconColor={colors.error.main} title="Salidas" subtitle={`${exits.length} registros · ${totalItems} unidades despachadas`} />

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
