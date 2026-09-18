import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, ModalSheet, OptionPickerField } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import type { CatalogShareLink } from '@/lib/catalogos/types';
import { useShareLinkHours } from '../infrastructure/hooks/useShareLinkHours';
import { shareLinkRecipient } from '../utils/shareMessages';
import { SHARE_LINK_DURATION_OPTIONS } from './ShareLinkCreateForm';

interface ReissueLinkSheetProps {
  link: CatalogShareLink | null;
  busy: boolean;
  /** Fallo del último intento; se pinta aquí porque el modal tapa la pantalla. */
  error: string | null;
  onClose: () => void;
  /** Al confirmar el servidor, quien llama cierra la hoja antes de mostrar la URL nueva. */
  onConfirm: (link: CatalogShareLink, hours: number) => Promise<boolean>;
}

/**
 * Emite un token nuevo sobre la misma versión congelada. Desde la migración
 * 20261010130000 el RPC además REVOCA el enlace anterior: la URL vieja deja
 * de funcionar en el acto, y la hoja lo advierte antes de confirmar.
 */
export function ReissueLinkSheet({ link, busy, error, onClose, onConfirm }: ReissueLinkSheetProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [hours, setHours] = useShareLinkHours();
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
            onPress={() => void onConfirm(link, Number(hours))}
            loading={busy}
            style={styles.primary}
          />
        </>
      }>
      <Text style={[styles.hint, { color: colors.text.secondary }]}>
        El cliente verá la misma edición (versión {link.versionNumber}) con una URL y una vigencia nuevas.
      </Text>
      <Text style={[styles.hint, { color: colors.warning.dark }]}>La URL anterior dejará de funcionar.</Text>
      <OptionPickerField
        value={hours}
        onValueChange={setHours}
        options={SHARE_LINK_DURATION_OPTIONS}
        placeholder="Vigencia"
        modalTitle="Vigencia del enlace"
        colors={colors}
        disabled={busy}
      />
      {error ? (
        <Text style={[styles.hint, { color: colors.error.main }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  hint: { ...Typography.caption, marginBottom: Spacing.xs },
  secondary: { flex: 1 },
  primary: { flex: 2 },
});
