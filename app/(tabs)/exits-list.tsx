import { ExitsList } from '@/components/exits-list/components/ExitsList';
import { ExitsSearchBar } from '@/components/exits-list/components/ExitsSearchBar';
import { useExitsList } from '@/components/exits-list/infrastructure/hooks/useExitsList';
import { Colors } from '@/constants/theme';
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function ExitsListScreen() {
  const { loadExits, loading, exits } = useExitsList();

  useEffect(() => {
    loadExits();
  }, [loadExits]);

  const handleRefresh = () => {
    loadExits();
  };

  const totalItems = exits.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={handleRefresh} />
      }>
      <View style={styles.header}>
        <Text style={styles.title}>Salidas</Text>
        {/*<Text style={styles.subtitle}>
          {exits.length} registro(s) - {totalItems} unidad(es) despachadas
        </Text>*/}
      </View>

      <ExitsSearchBar />

      <ExitsList />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.default,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
});

