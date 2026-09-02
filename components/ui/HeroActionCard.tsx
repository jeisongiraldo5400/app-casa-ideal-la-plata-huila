import { useTheme } from '@/components/theme';
import { IconSize, Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface HeroActionCardProps {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress: () => void;
  /** `compact` reduce la altura para usarlo como CTA dentro de listas. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Acción principal destacada sobre fondo oscuro (navigation.background).
 * Úsala una vez por pantalla para la acción más importante.
 */
export function HeroActionCard({ title, subtitle, icon, onPress, compact, style, accessibilityLabel }: HeroActionCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        { backgroundColor: colors.navigation.background },
        pressed && styles.pressed,
        style,
      ]}>
      <View style={[styles.icon, compact && styles.iconCompact, { backgroundColor: colors.primary.main }]}>
        <MaterialIcons name={icon} size={compact ? IconSize.md : IconSize.lg} color={colors.onPrimary.text} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.onPrimary.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.onPrimary.textMuted }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <MaterialIcons name="arrow-forward" size={IconSize.md} color={colors.navigation.inactive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 88,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  compact: { minHeight: 68, paddingVertical: Spacing.md },
  icon: { width: 46, height: 46, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center' },
  iconCompact: { width: 40, height: 40 },
  copy: { flex: 1 },
  title: { ...Typography.bodyStrong, fontWeight: '800' },
  subtitle: { ...Typography.metadata, fontWeight: '400', marginTop: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
