import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, Card, Input, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { DEFAULT_SHARE_LINK_HOURS, SHARE_LINK_DURATIONS } from '@/lib/catalogos/shareLinks';
import type { ShareLinkErrors } from '@/lib/catalogos/validators';
import type { SnapshotProgress } from '../infrastructure/services/catalogSnapshotService';

interface ShareLinkCreateFormProps {
  disabled: boolean;
  creating: boolean;
  progress: SnapshotProgress | null;
  errors: ShareLinkErrors;
  submitError: string | null;
  onCreate: (input: { label: string; hours: number }) => Promise<boolean>;
}

const DURATION_OPTIONS = SHARE_LINK_DURATIONS.map((duration) => ({ value: String(duration.hours), label: duration.label }));

export function ShareLinkCreateForm({ disabled, creating, progress, errors, submitError, onCreate }: ShareLinkCreateFormProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState(String(DEFAULT_SHARE_LINK_HOURS));

  const submit = async () => {
    const ok = await onCreate({ label, hours: Number(hours) });
    if (ok) setLabel('');
  };

  const progressLabel =
    creating && progress && progress.total > 0
      ? `Preparando la edición… ${progress.resolved}/${progress.total}`
      : creating
        ? 'Preparando la edición…'
        : 'Generar enlace';

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Nuevo enlace</Text>
      <Text style={[styles.hint, { color: colors.text.secondary }]}>
        Cada enlace congela la edición tal como está hoy. Puedes escribir para quién es o dejarlo vacío.
      </Text>
      <Input
        label="Para quién es (opcional)"
        value={label}
        onChangeText={setLabel}
        error={errors.label}
        placeholder="Ej. Familia Pérez"
        maxLength={120}
        editable={!creating}
      />
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.primary }]}>Vigencia</Text>
        <OptionPickerField
          value={hours}
          onValueChange={(value) => setHours(value || String(DEFAULT_SHARE_LINK_HOURS))}
          options={DURATION_OPTIONS}
          placeholder="Vigencia"
          modalTitle="Vigencia del enlace"
          colors={colors}
          disabled={creating}
        />
        {errors.hours ? <Text style={[styles.error, { color: colors.error.main }]}>{errors.hours}</Text> : null}
      </View>
      {submitError ? <Text style={[styles.error, { color: colors.error.main }]}>{submitError}</Text> : null}
      <Button title={progressLabel} icon="link" onPress={() => void submit()} loading={creating} disabled={disabled || creating} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.md },
  title: { ...Typography.section },
  hint: { ...Typography.caption },
  field: { gap: Spacing.xs },
  label: { ...Typography.bodySmallStrong },
  error: { ...Typography.caption },
});
