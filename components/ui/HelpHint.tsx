import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  /** Nombre del término (título de la ayuda y nombre accesible). */
  term: string;
  /** Frase llana que lo explica. */
  text: string;
  size?: number;
};

/**
 * Ayuda corta «?» junto a un término difícil. Un toque abre la frase en una
 * tarjeta pequeña; otro toque en cualquier parte la cierra.
 */
export function HelpHint({ term, text, size = 14 }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Qué es: ${term}`}
        testID={`help-${term}`}
      >
        <MaterialIcons name="help-outline" size={size} color={colors.text.secondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)} accessibilityLabel="Cerrar ayuda">
          <View style={[styles.card, { backgroundColor: colors.surface.elevated }]}>
            <Text style={[styles.title, { color: colors.text.primary }]}>{term}</Text>
            <Text style={[styles.text, { color: colors.text.secondary }]}>{text}</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  card: { borderRadius: Radius.control, padding: Spacing.lg, gap: Spacing.xs },
  title: { ...Typography.bodySmallStrong },
  text: { ...Typography.bodySmall },
});
