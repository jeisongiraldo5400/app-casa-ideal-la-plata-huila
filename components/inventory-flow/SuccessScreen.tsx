import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { ScreenState } from '@/components/ui/ScreenState';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface SuccessScreenProps {
  title: string;
  description: string;
  status?: { text: string; tone: 'success' | 'primary'; icon: IconName } | null;
  actions: { title: string; variant?: 'primary' | 'outline' | 'ghost'; onPress: () => void }[];
}

/** Pantalla de cierre tras registrar una entrada o salida. */
export function SuccessScreen({ title, description, status, actions }: SuccessScreenProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <ScreenState title={title} description={description} icon="check-circle" />
      {status ? (
        <View style={[styles.status, { backgroundColor: status.tone === 'success' ? `${colors.success.main}18` : colors.surface.muted }]} accessibilityLiveRegion="polite">
          <MaterialIcons name={status.icon} size={22} color={status.tone === 'success' ? colors.success.main : colors.primary.main} />
          <Text style={[styles.statusText, { color: colors.text.primary }]}>{status.text}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {actions.map((action) => (
          <Button key={action.title} title={action.title} variant={action.variant} onPress={action.onPress} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  status: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, padding: Spacing.md },
  statusText: { ...Typography.bodySmallStrong, flex: 1, fontWeight: '600' },
  actions: { gap: Spacing.sm, marginTop: Spacing.xl },
});
