import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info';

interface ActionCardProps {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress: () => void;
  tone?: Tone;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ActionCard({ title, subtitle, icon, onPress, tone = 'primary', compact, style }: ActionCardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = tone === 'primary' ? colors.primary.main : colors[tone].main;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        { backgroundColor: colors.background.paper, borderColor: colors.divider },
        pressed && styles.pressed,
        style,
      ]}>
      <View style={[styles.icon, { backgroundColor: `${accent}16` }]}>
        <MaterialIcons name={icon} size={compact ? 22 : 25} color={accent} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.text.secondary }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {!compact ? <MaterialIcons name="arrow-forward" size={19} color={colors.text.secondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 86,
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.card,
  },
  compact: { minHeight: 76, padding: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});
