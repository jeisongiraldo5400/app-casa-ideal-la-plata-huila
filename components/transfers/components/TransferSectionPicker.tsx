import { useTheme } from '@/components/theme';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TRANSFER_SECTIONS, type TransferSectionKey } from '../utils/transferTasks';

type Props = {
  value: TransferSectionKey;
  counts: Record<TransferSectionKey, number>;
  onChange: (value: TransferSectionKey) => void;
};

/**
 * Las cuatro secciones de Traslados como tarjetas en cuadrícula de 2×2: la
 * etiqueta completa, qué se hace ahí y cuántos hay. Reemplaza las pestañas,
 * que en el teléfono cortaban los nombres («Desp…», «Tran…»).
 */
export function TransferSectionPicker({ value, counts, onChange }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <View style={styles.grid} accessibilityRole="tablist">
      {TRANSFER_SECTIONS.map((section) => {
        const selected = section.key === value;
        const count = counts[section.key];
        const accent = selected ? colors.primary.main : count > 0 ? colors.text.primary : colors.text.secondary;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${section.tabLabel}: ${section.hint}. ${count} pendiente${count === 1 ? '' : 's'}`}
            onPress={() => onChange(section.key)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: selected ? colors.surface.muted : colors.background.paper,
                borderColor: selected ? colors.primary.main : colors.divider,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.top}>
              <MaterialIcons name={section.icon} size={IconSize.md} color={accent} />
              <Text
                style={[
                  styles.count,
                  { color: count > 0 ? (selected ? colors.primary.main : colors.text.primary) : colors.text.disabled },
                ]}
              >
                {count}
              </Text>
            </View>
            <Text style={[styles.label, { color: accent }]} numberOfLines={1}>
              {section.tabLabel}
            </Text>
            <Text style={[styles.hint, { color: colors.text.secondary }]} numberOfLines={1}>
              {section.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { ...Typography.section },
  label: { ...Typography.bodySmallStrong },
  hint: { ...Typography.caption },
});
