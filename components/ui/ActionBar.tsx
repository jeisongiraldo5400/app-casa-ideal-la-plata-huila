import { useTheme } from '@/components/theme';
import { Spacing, getColors } from '@/constants/theme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ActionBarProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Barra de acciones fija al pie de una pantalla de detalle. Colócala como
 * hermana del ScrollView (fuera de él) dentro de un contenedor `flex: 1`.
 * Los hijos se colocan en fila; cada uno define su propio `flex`
 * (p. ej. `flex: 2` para la acción principal y `flex: 1` para las secundarias).
 */
export function ActionBar({ children, style }: ActionBarProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, Spacing.md) },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
});
