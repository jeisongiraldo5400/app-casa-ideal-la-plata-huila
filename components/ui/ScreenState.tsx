import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Button } from './Button';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface ScreenStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  /** `inline` quita borde y fondo (dentro de listas). */
  variant?: 'card' | 'inline';
  /** Colorea el icono según el significado. */
  tone?: 'primary' | 'error' | 'warning';
  /** Contenido extra bajo la descripción (p. ej. un botón de descarga). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenState({
  title,
  description,
  icon = 'inbox',
  loading,
  actionLabel,
  onAction,
  variant = 'card',
  tone = 'primary',
  children,
  style,
}: ScreenStateProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = tone === 'primary' ? colors.primary.main : colors[tone].main;
  const iconName = tone === 'error' && icon === 'inbox' ? 'error-outline' : icon;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        variant === 'card' && [styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }],
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary.main} />
      ) : (
        <View style={[styles.icon, { backgroundColor: `${accent}16` }]}>
          <MaterialIcons name={iconName} size={28} color={accent} />
        </View>
      )}
      <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: colors.text.secondary }]}>{description}</Text> : null}
      {children}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} variant="outline" style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  card: { borderWidth: 1, borderRadius: Radius.card },
  icon: { width: 54, height: 54, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  title: { ...Typography.section, fontSize: 18, lineHeight: 23, textAlign: 'center' },
  description: { ...Typography.bodySmall, textAlign: 'center', maxWidth: 300 },
  action: { marginTop: Spacing.sm, alignSelf: 'stretch' },
});
