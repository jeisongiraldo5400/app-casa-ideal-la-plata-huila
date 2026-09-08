import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface SessionItemCardProps {
  name: string;
  meta: string;
  quantity: number;
  quantityCaption: string;
  canDecrease: boolean;
  canIncrease: boolean;
  /** Aviso bajo el editor, p. ej. "Sin más stock en bodega". */
  note?: string | null;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}

/** Producto ya agregado a la sesión, con edición de cantidad y eliminación. */
export function SessionItemCard({
  name,
  meta,
  quantity,
  quantityCaption,
  canDecrease,
  canIncrease,
  note,
  onDecrease,
  onIncrease,
  onRemove,
}: SessionItemCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.surface.muted }]}>
          <MaterialIcons name="inventory-2" size={21} color={colors.primary.main} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>{name}</Text>
          <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={2}>{meta}</Text>
        </View>
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Quitar ${name}`}
          hitSlop={4}
        >
          <MaterialIcons name="delete-outline" size={22} color={colors.error.main} />
        </Pressable>
      </View>
      <View style={styles.editor}>
        <Text style={[styles.caption, { color: colors.text.secondary }]}>{quantityCaption}</Text>
        <View style={styles.controls}>
          <Pressable
            disabled={!canDecrease}
            onPress={onDecrease}
            style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.surface.muted }, !canDecrease && styles.disabled, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Disminuir cantidad de ${name}`}
            accessibilityState={{ disabled: !canDecrease }}
          >
            <MaterialIcons name="remove" size={20} color={colors.primary.main} />
          </Pressable>
          <Text style={[styles.quantity, { color: colors.text.primary }]} accessibilityLabel={`Cantidad ${quantity}`}>{quantity}</Text>
          <Pressable
            disabled={!canIncrease}
            onPress={onIncrease}
            style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.surface.muted }, !canIncrease && styles.disabled, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Aumentar cantidad de ${name}`}
            accessibilityState={{ disabled: !canIncrease }}
          >
            <MaterialIcons name="add" size={20} color={colors.primary.main} />
          </Pressable>
        </View>
      </View>
      {note ? <Text style={[styles.note, { color: colors.warning.main }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.md, padding: Spacing.md },
  row: { alignItems: 'center', flexDirection: 'row' },
  icon: { alignItems: 'center', borderRadius: Radius.control, height: 42, justifyContent: 'center', width: 42 },
  copy: { flex: 1, marginLeft: Spacing.md },
  name: { ...Typography.bodySmallStrong, fontWeight: '800' },
  meta: { ...Typography.metadata, fontSize: 11, lineHeight: 16, marginTop: 3 },
  removeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  editor: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  caption: { ...Typography.metadata },
  controls: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  stepButton: { alignItems: 'center', borderRadius: Radius.chip, height: 44, justifyContent: 'center', width: 44 },
  quantity: { ...Typography.headline, fontSize: 18, lineHeight: 22, minWidth: 32, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  note: { ...Typography.metadata, marginTop: Spacing.sm },
});
