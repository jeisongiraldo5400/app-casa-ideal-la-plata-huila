import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, ModalSheet } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import { formatCatalogDateTime } from '@/lib/catalogos/labels';
import type { ShareLinkResult } from '../infrastructure/hooks/useShareLinkFlow';
import { copyLinkToClipboard, openLinkInBrowser, shareLinkByWhatsApp, shareLinkMessage } from '../utils/shareActions';
import { buildShareMessage } from '../utils/shareMessages';

interface ShareLinkResultSheetProps {
  result: ShareLinkResult | null;
  publicTitle: string;
  onClose: () => void;
}

/** Recibo del enlace recién creado o reemitido, con las acciones para entregarlo. */
export function ShareLinkResultSheet({ result, publicTitle, onClose }: ShareLinkResultSheetProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!result) return null;
  const message = buildShareMessage({ publicTitle, url: result.url, expiresAt: result.expiresAt, label: result.label });

  return (
    <ModalSheet
      visible
      onClose={onClose}
      title={result.reissued ? 'Enlace reemitido' : 'Enlace listo'}
      subtitle={`${result.label ? `Para ${result.label} · ` : ''}Vence el ${formatCatalogDateTime(result.expiresAt)}`}
      footer={<Button title="Listo" variant="outline" onPress={onClose} style={styles.done} />}>
      <View style={[styles.urlBox, { backgroundColor: colors.surface.sunken }]}>
        <Text selectable style={[styles.url, { color: colors.text.primary }]}>
          {result.url}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Compartir" icon="share" onPress={() => void shareLinkMessage(message, publicTitle)} style={styles.action} />
        <Button title="WhatsApp" icon="chat" variant="secondary" onPress={() => void shareLinkByWhatsApp(message)} style={styles.action} />
      </View>
      <View style={styles.actions}>
        <Button
          title={copied ? 'Copiado' : 'Copiar'}
          icon={copied ? 'check' : 'content-copy'}
          variant="outline"
          onPress={() => void copyLinkToClipboard(result.url).then(setCopied)}
          style={styles.action}
        />
        <Button title="Abrir" icon="open-in-new" variant="outline" onPress={() => void openLinkInBrowser(result.url)} style={styles.action} />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  urlBox: { borderRadius: Radius.control, padding: Spacing.md },
  url: { ...Typography.bodySmall },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  action: { flex: 1 },
  done: { flex: 1 },
});
