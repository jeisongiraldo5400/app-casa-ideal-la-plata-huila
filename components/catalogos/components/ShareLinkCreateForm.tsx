import React, { useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
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
  /** Aviso de una línea bajo el título (p. ej. qué producto se va a enviar). */
  notice?: string | null;
  onCreate: (input: CreateShareLinkRequest) => Promise<boolean>;
}

export const SHARE_LINK_DURATION_OPTIONS = SHARE_LINK_DURATIONS.map((duration) => ({ value: String(duration.hours), label: duration.label }));

/** Acción principal: generar y abrir WhatsApp en un toque. «Solo generar» no lo abre; en ambos queda la hoja para copiar o abrir. */
export function ShareLinkCreateForm({ disabled, creating, progress, errors, submitError, notice, onCreate }: ShareLinkCreateFormProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useShareLinkHours();
  const [delivery, setDelivery] = useState<ShareLinkDelivery>('whatsapp');
  // Opcional y apagado: sin activarlo, el enlace sale sin precios.
  const [includeSalePrice, setIncludeSalePrice] = useState(false);
  // `creating` llega un render tarde: dos toques seguidos generarían dos enlaces.
  const submitting = useRef(false);

  const submit = async (next: ShareLinkDelivery) => {
    if (submitting.current) return;
    submitting.current = true;
    setDelivery(next);
    try {
      const ok = await onCreate({ label, hours: Number(hours), delivery: next, includeSalePrice });
      if (ok) {
        setLabel('');
        setIncludeSalePrice(false);
      }
    } finally {
      submitting.current = false;
    }
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
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={[styles.label, { color: colors.text.primary }]}>Incluir precio de venta</Text>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>El cliente verá el precio de los productos que lo tengan.</Text>
        </View>
        <Switch
          testID="share-link-sale-price"
          accessibilityLabel="Incluir precio de venta"
          value={includeSalePrice}
          onValueChange={setIncludeSalePrice}
          disabled={creating}
          trackColor={{ false: colors.divider, true: colors.primary.light }}
          thumbColor={includeSalePrice ? colors.primary.main : colors.text.secondary}
        />
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  switchText: { flex: 1, gap: 2 },
  error: { ...Typography.caption },
});
