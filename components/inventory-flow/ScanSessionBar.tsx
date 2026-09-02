import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ScanSessionBarProps {
  productCount: number;
  unitCount: number;
  unitLabel: string;
  /** Nombres de los últimos productos agregados (más reciente primero). */
  lastItems: string[];
  bottomInset: number;
  onShowList: () => void;
}

/** Barra persistente sobre el escáner: lo agregado hasta ahora y acceso a la lista. */
export function ScanSessionBar({ productCount, unitCount, unitLabel, lastItems, bottomInset, onShowList }: ScanSessionBarProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const recent = lastItems.slice(0, 3).join(' · ');
  return (
    <Pressable
      onPress={onShowList}
      accessibilityRole="button"
      accessibilityLabel={`${productCount} productos, ${unitCount} ${unitLabel}. Ver la lista`}
      style={({ pressed }) => [styles.bar, { backgroundColor: colors.background.paper, bottom: Math.max(bottomInset, Spacing.md) + Spacing.sm }, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: `${colors.primary.main}16` }]}>
        <MaterialIcons name="shopping-cart" size={20} color={colors.primary.main} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.total, { color: colors.text.primary }]}>{productCount} productos · {unitCount} {unitLabel}</Text>
        <Text style={[styles.recent, { color: colors.text.secondary }]} numberOfLines={1}>{recent || 'Aún no has agregado productos'}</Text>
      </View>
      <MaterialIcons name="expand-less" size={22} color={colors.text.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', borderRadius: Radius.card, flexDirection: 'row', gap: Spacing.md, left: Spacing.lg, minHeight: 60, padding: Spacing.md, position: 'absolute', right: Spacing.lg, zIndex: 25, ...Shadows.floating },
  pressed: { opacity: 0.9 },
  icon: { alignItems: 'center', borderRadius: Radius.control, height: 40, justifyContent: 'center', width: 40 },
  copy: { flex: 1 },
  total: { ...Typography.bodySmallStrong },
  recent: { ...Typography.metadata, marginTop: 1 },
});
