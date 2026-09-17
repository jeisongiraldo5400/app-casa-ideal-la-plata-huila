import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, IconButton, ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { formatCatalogDateTime, labelShareLinkStatus, pluralize, shareLinkStatusTone } from '@/lib/catalogos/labels';
import { buildMagazineUrl, catalogShareLinkStatus, catalogSiteUrl, isShareLinkShareable } from '@/lib/catalogos/shareLinks';
import type { CatalogShareLink } from '@/lib/catalogos/types';
import { copyLinkToClipboard, shareLinkByWhatsApp, shareLinkMessage } from '../utils/shareActions';
import { buildShareMessage, shareLinkRecipient } from '../utils/shareMessages';

interface ShareLinkRowProps {
  link: CatalogShareLink;
  now: number;
  publicTitle: string;
  /** Resumen en el detalle: solo el acceso directo a WhatsApp. */
  compact?: boolean;
  reissuing?: boolean;
  onReissue?: (link: CatalogShareLink) => void;
}

/** Enlace entregado. Si sigue vigente se puede reenviar tal cual, sin generar otro. */
export function ShareLinkRow({ link, now, publicTitle, compact, reissuing, onReissue }: ShareLinkRowProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [copied, setCopied] = useState(false);
  const status = catalogShareLinkStatus(link, now);
  // Sin URL del sitio configurada no se puede armar el enlace (buildMagazineUrl lanzaría).
  const shareable = isShareLinkShareable(link, now) && catalogSiteUrl() !== null;
  const recipient = shareLinkRecipient(link.label);
  const meta = [
    `v${link.versionNumber}`,
    pluralize(link.viewCount, 'vista', 'vistas'),
    `${status === 'active' ? 'vence' : 'venció'} ${formatCatalogDateTime(link.expiresAt)}`,
  ].join(' · ');

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const message = () => (link.token ? buildShareMessage({ url: buildMagazineUrl(link.token), label: link.label }) : null);
  const sendWhatsApp = () => {
    const text = message();
    if (text) void shareLinkByWhatsApp(text);
  };
  const share = () => {
    const text = message();
    if (text) void shareLinkMessage(text, publicTitle);
  };
  const copy = () => {
    if (!link.token) return;
    void copyLinkToClipboard(buildMagazineUrl(link.token)).then(setCopied);
  };

  return (
    <ListCard>
      <View style={styles.top}>
        <Text style={[styles.label, { color: colors.text.primary }]} numberOfLines={1}>
          {recipient ?? 'Enlace sin destinatario'}
        </Text>
        <StatusChip label={labelShareLinkStatus(status)} tone={shareLinkStatusTone(status)} />
        {compact && shareable ? (
          <IconButton
            icon="chat"
            color={colors.success.dark}
            onPress={sendWhatsApp}
            accessibilityLabel={`Reenviar por WhatsApp${recipient ? ` a ${recipient}` : ''}`}
          />
        ) : null}
      </View>
      <Text style={[styles.meta, { color: colors.text.secondary }]} numberOfLines={1}>
        {meta}
      </Text>
      {link.token === null ? (
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>…{link.tokenHint} · URL no recuperable: reemítelo para entregar uno nuevo.</Text>
      ) : null}
      {!compact ? (
        <View style={styles.actions}>
          {shareable ? (
            <>
              <Button title="WhatsApp" icon="chat" size="sm" onPress={sendWhatsApp} style={styles.primary} />
              <Button
                title={copied ? 'Copiado' : 'Copiar'}
                icon={copied ? 'check' : 'content-copy'}
                size="sm"
                variant="outline"
                onPress={copy}
                style={styles.action}
              />
              <Button title="Compartir" icon="share" size="sm" variant="outline" iconOnly onPress={share} accessibilityLabel="Compartir por otra app" />
            </>
          ) : null}
          {onReissue && status !== 'revoked' ? (
            <Button title="Reemitir" icon="autorenew" size="sm" variant="ghost" onPress={() => onReissue(link)} loading={reissuing} style={styles.action} />
          ) : null}
        </View>
      ) : null}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  label: { ...Typography.bodyStrong, flex: 1 },
  meta: { ...Typography.caption },
  hint: { ...Typography.caption },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  primary: { flexGrow: 2, flexBasis: '35%' },
  action: { flexGrow: 1, flexBasis: '25%' },
});
