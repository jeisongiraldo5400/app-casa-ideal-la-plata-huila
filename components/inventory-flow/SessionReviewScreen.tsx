import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner } from './ErrorBanner';

export interface ReviewItem {
  key: string;
  name: string;
  meta: string;
  quantity: number;
}

interface SessionReviewScreenProps {
  title: string;
  subtitle: string;
  summaryTitle: string;
  summaryMeta: string;
  /** Texto de estado bajo el resumen (p. ej. "Esta salida completa la orden"). */
  statusText?: string | null;
  statusTone?: 'success' | 'warning';
  items: ReviewItem[];
  observation?: { value: string; placeholder: string; onChange: (value: string) => void };
  error: string | null;
  /** Aviso no bloqueante sobre el pie (p. ej. sin conexión). */
  notice?: string | null;
  loading: boolean;
  finalizeDisabled?: boolean;
  finalizeLabel: string;
  onBack: () => void;
  onFinalize: () => void;
}

/** Última revisión antes de registrar: resumen, observación opcional y lista de productos. */
export function SessionReviewScreen({
  title,
  subtitle,
  summaryTitle,
  summaryMeta,
  statusText,
  statusTone = 'success',
  items,
  observation,
  error,
  notice,
  loading,
  finalizeDisabled = false,
  finalizeLabel,
  onBack,
  onFinalize,
}: SessionReviewScreenProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background.default }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 170 + insets.bottom }]}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <IconButton icon="arrow-back" onPress={onBack} accessibilityLabel="Volver a la lista" backgroundColor={colors.background.paper} />
              <View style={styles.copy}>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{subtitle}</Text>
              </View>
            </View>
            <View style={[styles.summary, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
              <Text style={[styles.summaryTitle, { color: colors.text.primary }]}>{summaryTitle}</Text>
              <Text style={[styles.summaryMeta, { color: colors.text.secondary }]}>{summaryMeta}</Text>
              {statusText ? (
                <Text style={[styles.status, { color: statusTone === 'warning' ? colors.warning.main : colors.success.main }]}>{statusText}</Text>
              ) : null}
            </View>
            {observation ? (
              <TextInput
                multiline
                value={observation.value}
                onChangeText={observation.onChange}
                placeholder={observation.placeholder}
                placeholderTextColor={colors.text.secondary}
                accessibilityLabel={observation.placeholder}
                style={[styles.observation, { backgroundColor: colors.background.paper, borderColor: colors.divider, color: colors.text.primary }]}
              />
            ) : null}
            {notice ? <ErrorBanner message={notice} tone="warning" icon="wifi-off" /> : null}
            {error ? <ErrorBanner message={error} /> : null}
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Productos a registrar</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.item, { backgroundColor: colors.background.paper, borderColor: colors.divider }]} accessible accessibilityLabel={`${item.name}, ${item.meta}, cantidad ${item.quantity}`}>
            <View style={styles.copy}>
              <Text style={[styles.itemName, { color: colors.text.primary }]}>{item.name}</Text>
              <Text style={[styles.itemMeta, { color: colors.text.secondary }]}>{item.meta}</Text>
            </View>
            <Text style={[styles.itemQuantity, { color: colors.primary.main }]}>{item.quantity}</Text>
          </View>
        )}
      />
      <View style={[styles.footer, { backgroundColor: colors.background.paper, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <Button title={finalizeLabel} onPress={onFinalize} loading={loading} disabled={loading || finalizeDisabled} />
        <Button title="Seguir editando" variant="ghost" onPress={onBack} disabled={loading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  copy: { flex: 1 },
  title: { ...Typography.title, fontSize: 25, lineHeight: 30 },
  subtitle: { ...Typography.metadata, marginTop: 2 },
  summary: { borderRadius: Radius.card, borderWidth: 1, marginBottom: Spacing.lg, padding: Spacing.lg },
  summaryTitle: { ...Typography.bodyStrong, fontSize: 17, lineHeight: 22 },
  summaryMeta: { ...Typography.metadata, marginTop: 3 },
  status: { ...Typography.metadata, fontWeight: '700', marginTop: Spacing.sm },
  observation: { ...Typography.body, borderRadius: Radius.control, borderWidth: 1.5, marginBottom: Spacing.lg, minHeight: 92, padding: Spacing.md, textAlignVertical: 'top' },
  sectionTitle: { ...Typography.section, fontSize: 17, lineHeight: 22, marginBottom: Spacing.md },
  item: { alignItems: 'center', borderRadius: Radius.control, borderWidth: 1, flexDirection: 'row', marginBottom: Spacing.sm, padding: Spacing.md },
  itemName: { ...Typography.bodySmallStrong, fontWeight: '800' },
  itemMeta: { ...Typography.metadata, fontSize: 11, lineHeight: 16, marginTop: 3 },
  itemQuantity: { ...Typography.headline, fontSize: 20, lineHeight: 24, marginLeft: Spacing.md },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, gap: Spacing.sm, left: 0, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, position: 'absolute', right: 0, ...Shadows.floating },
});
