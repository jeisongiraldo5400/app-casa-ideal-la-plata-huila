import { useTheme } from '@/components/theme';
import { BackButton, Card, ScreenState, SegmentedControl } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useIsFocused } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WarehouseDetailTab } from '../utils/warehouseRoutes';
import { OFFLINE_WAREHOUSES_MESSAGE } from '../utils/warehouseTexts';
import { WarehouseHistoryView } from './WarehouseHistoryView';
import { WarehouseStockView } from './WarehouseStockView';
import { WarehouseTransfersView } from './WarehouseTransfersView';

type Props = {
  warehouseId: string | null;
  /** Nombre que llega desde la lista (título mientras carga). */
  warehouseName?: string | null;
  initialTab?: WarehouseDetailTab;
};

const TABS: { value: WarehouseDetailTab; label: string; icon: 'inventory-2' | 'local-shipping' | 'history' }[] = [
  { value: 'productos', label: 'Productos', icon: 'inventory-2' },
  { value: 'camino', label: 'En camino', icon: 'local-shipping' },
  { value: 'historial', label: 'Historial', icon: 'history' },
];

/**
 * Detalle de una bodega: Productos (existencias), En camino (traslados que
 * llegan y por sacar) e Historial (movimientos). El servidor rechaza a
 * quien no es admin ni Responsable de la bodega («Sin permiso para ver esta
 * bodega»); el mensaje se muestra tal cual en cada pestaña.
 */
export function WarehouseDetailScreen({ warehouseId, warehouseName, initialTab = 'productos' }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const focused = useIsFocused();
  const online = useNetworkStatus();
  const [tab, setTab] = useState<WarehouseDetailTab>(initialTab);
  const screenOptions = { title: warehouseName || 'Bodega', headerLeft: () => <BackButton /> };

  if (!warehouseId) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <ScreenState tone="error" title="Bodega no encontrada" description="El enlace no trae la bodega." style={styles.state} />
      </>
    );
  }

  const enabled = focused && online;
  return (
    <View style={[styles.flex, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={screenOptions} />
      <View style={styles.top}>
        <SegmentedControl items={TABS} value={tab} onChange={(value) => setTab(value as WarehouseDetailTab)} />
        {!online ? (
          <Card variant="muted">
            <Text style={[styles.banner, { color: colors.warning.dark }]} accessibilityLiveRegion="polite">
              {OFFLINE_WAREHOUSES_MESSAGE}
            </Text>
          </Card>
        ) : null}
      </View>
      <View style={styles.flex}>
        {tab === 'productos' ? <WarehouseStockView warehouseId={warehouseId} enabled={enabled} online={online} /> : null}
        {tab === 'camino' ? <WarehouseTransfersView warehouseId={warehouseId} enabled={enabled} online={online} /> : null}
        {tab === 'historial' ? <WarehouseHistoryView warehouseId={warehouseId} enabled={enabled} online={online} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.sm },
  banner: { ...Typography.caption },
  state: { margin: Spacing.xl },
});
