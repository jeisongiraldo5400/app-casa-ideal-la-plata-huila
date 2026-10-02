import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

type Props<K extends string> = {
  items: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
};

/** Fila horizontal de filtros (uno elegido), como en el historial de Traslados. */
export function FilterChips<K extends string>({ items, value, onChange }: Props<K>) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.primary.main : colors.background.paper,
                borderColor: selected ? colors.primary.main : colors.divider,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: selected ? colors.primary.contrastText : colors.text.primary }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  chip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  chipText: { ...Typography.bodySmallStrong },
});
