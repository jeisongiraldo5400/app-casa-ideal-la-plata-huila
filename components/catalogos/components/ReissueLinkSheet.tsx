import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, ModalSheet, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { DEFAULT_SHARE_LINK_HOURS, SHARE_LINK_DURATIONS } from '@/lib/catalogos/shareLinks';
import type { CatalogShareLink } from '@/lib/catalogos/types';
import { shareLinkRecipient } from '../utils/shareMessages';

interface ReissueLinkSheetProps {
  link: CatalogShareLink | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (link: CatalogShareLink, hours: number) => Promise<boolean>;
}

const DURATION_OPTIONS = SHARE_LINK_DURATIONS.map((duration) => ({ value: String(duration.hours), label: duration.label }));

/** Emite un token nuevo sobre la misma versión congelada; el enlace anterior sigue vivo hasta que venza. */
export function ReissueLinkSheet({ link, busy, onClose, onConfirm }: ReissueLinkSheetProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [hours, setHours] = useState(String(DEFAULT_SHARE_LINK_HOURS));
  if (!link) return null;
  const recipient = shareLinkRecipient(link.label);

  return (
    <ModalSheet
      visible
      onClose={onClose}
      title="Reemitir enlace"
      subtitle={recipient ? `Para ${recipient}` : 'Enlace sin destinatario'}
      dismissable={!busy}
      footer={
        <>
          <Button title="Cancelar" variant="outline" onPress={onClose} disabled={busy} style={styles.secondary} />
          <Button
            title="Reemitir"
            onPress={() => void onConfirm(link, Number(hours)).then((ok) => ok && onClose())}
            loading={busy}
            style={styles.primary}
          />
        </>
      }>
      <Text style={[styles.hint, { color: colors.text.secondary }]}>
        El cliente verá exactamente la misma edición que se le entregó (versión {link.versionNumber}), con una URL y una vigencia nuevas.
      </Text>
      <OptionPickerField
        value={hours}
        onValueChange={(value) => setHours(value || String(DEFAULT_SHARE_LINK_HOURS))}
        options={DURATION_OPTIONS}
        placeholder="Vigencia"
        modalTitle="Vigencia del enlace"
        colors={colors}
        disabled={busy}
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  hint: { ...Typography.caption, marginBottom: Spacing.xs },
  secondary: { flex: 1 },
  primary: { flex: 2 },
});
