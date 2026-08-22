import { useTheme } from '@/components/theme';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface ScreenStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export function ScreenState({ title, description, icon = 'inbox', loading, actionLabel, onAction }: ScreenStateProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={[styles.container, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      {loading ? <ActivityIndicator size="large" color={colors.primary.main} /> : <View style={[styles.icon, { backgroundColor: colors.surface.muted }]}><MaterialIcons name={icon} size={28} color={colors.primary.main} /></View>}
      <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: colors.text.secondary }]}>{description}</Text> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} variant="outline" style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  icon: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  action: { marginTop: Spacing.sm, alignSelf: 'stretch' },
});
