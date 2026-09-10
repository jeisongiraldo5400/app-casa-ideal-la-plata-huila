import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui';
import { IconSize, Spacing, Typography, getColors } from '@/constants/theme';

/** Recordatorio de lo que se hace desde el panel web (decisión de alcance del módulo móvil). */
export function WebOnlyNotice() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <Card variant="muted" style={styles.card}>
      <MaterialIcons name="desktop-windows" size={IconSize.md} color={colors.info.main} />
      <Text style={[styles.text, { color: colors.text.secondary }]}>
        Portada, fotos, videos y diseño se editan desde el panel web de catálogos.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  text: { ...Typography.caption, flex: 1 },
});
