import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { IconButton } from './IconButton';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: IconName;
  iconColor?: string;
  actionIcon?: IconName;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  iconColor,
  actionIcon,
  actionLabel,
  onActionPress,
  style,
}: ScreenHeaderProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = iconColor ?? colors.primary.main;

  return (
    <View style={[styles.container, style]}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
          <MaterialIcons name={icon} size={25} color={accent} />
        </View>
      ) : null}
      <View style={styles.copy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary.main }]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{subtitle}</Text> : null}
      </View>
      {actionIcon && onActionPress ? (
        <IconButton
          icon={actionIcon}
          onPress={onActionPress}
          accessibilityLabel={actionLabel ?? 'Acción'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: Radius.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  eyebrow: {
    ...Typography.metadata,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: { ...Typography.title },
  subtitle: { ...Typography.body, marginTop: Spacing.xs },
});
