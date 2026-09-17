import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, Card, Input, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { SHARE_LINK_DURATIONS } from '@/lib/catalogos/shareLinks';
import type { ShareLinkErrors } from '@/lib/catalogos/validators';
import type { CreateShareLinkRequest, ShareLinkDelivery } from '../infrastructure/hooks/useShareLinkFlow';
import { useShareLinkHours } from '../infrastructure/hooks/useShareLinkHours';
import type { SnapshotProgress } from '../infrastructure/services/catalogSnapshotService';

interface ShareLinkCreateFormProps {
  disabled: boolean;
  creating: boolean;
  progress: SnapshotProgress | null;
  errors: ShareLinkErrors;
  submitError: string | null;
  /** Aviso de una línea bajo el título (p. ej. que el catálogo se publicará al equipo). */
  notice?: string | null;
  onCreate: (input: CreateShareLinkRequest) => Promise<boolean>;
}

export const SHARE_LINK_DURATION_OPTIONS = SHARE_LINK_DURATIONS.map((duration) => ({ value: String(duration.hours), label: duration.label }));

/** Acción principal: generar y abrir WhatsApp en un toque. «Solo generar» deja la hoja para copiar o abrir. */
export function ShareLinkCreateForm({ disabled, creating, progress, errors, submitError, notice, onCreate }: ShareLinkCreateFormProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useShareLinkHours();
  const [delivery, setDelivery] = useState<ShareLinkDelivery>('whatsapp');

  const submit = async (next: ShareLinkDelivery) => {
    setDelivery(next);
    const ok = await onCreate({ label, hours: Number(hours), delivery: next });
    if (ok) setLabel('');
  };

  const progressLabel =
    progress && progress.total > 0 ? `Preparando la edición… ${progress.resolved}/${progress.total}` : 'Preparando la edición…';

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.text.primary }]}>Nuevo enlace</Text>
      <Text style={[styles.hint, { color: colors.text.secondary }]}>Congela la edición de hoy. El nombre es opcional.</Text>
      {notice ? <Text style={[styles.hint, { color: colors.warning.dark }]}>{notice}</Text> : null}
      <Input
        label="Para quién es"
        value={label}
        onChangeText={setLabel}
        error={errors.label}
        placeholder="Ej. Familia Pérez"
        maxLength={120}
        editable={!creating}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (!disabled && !creating) void submit('whatsapp');
        }}
      />
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.primary }]}>Vigencia</Text>
        <OptionPickerField
          value={hours}
          onValueChange={setHours}
          options={SHARE_LINK_DURATION_OPTIONS}
          placeholder="Vigencia"
          modalTitle="Vigencia del enlace"
          colors={colors}
          disabled={creating}
        />
        {errors.hours ? <Text style={[styles.error, { color: colors.error.main }]}>{errors.hours}</Text> : null}
      </View>
      {submitError ? (
        <Text style={[styles.error, { color: colors.error.main }]} accessibilityLiveRegion="polite">
          {submitError}
        </Text>
      ) : null}
      {creating ? (
        <Text style={[styles.hint, { color: colors.text.secondary }]} accessibilityLiveRegion="polite">
          {progressLabel}
        </Text>
      ) : null}
      <Button
        title="Generar y enviar por WhatsApp"
        icon="chat"
        onPress={() => void submit('whatsapp')}
        loading={creating && delivery === 'whatsapp'}
        disabled={disabled || creating}
      />
      <Button
        title="Solo generar"
        icon="link"
        variant="ghost"
        size="sm"
        onPress={() => void submit('none')}
        loading={creating && delivery === 'none'}
        disabled={disabled || creating}
      />
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
