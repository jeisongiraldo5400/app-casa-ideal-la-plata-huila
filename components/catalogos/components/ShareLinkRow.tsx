import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, ListCard, StatusChip } from '@/components/ui';
import { Spacing, Typography, getColors } from '@/constants/theme';
import { formatCatalogDateTime, labelShareLinkStatus, pluralize, shareLinkStatusTone } from '@/lib/catalogos/labels';
import { buildMagazineUrl, catalogShareLinkStatus, isShareLinkShareable } from '@/lib/catalogos/shareLinks';
import type { CatalogShareLink } from '@/lib/catalogos/types';
import { copyLinkToClipboard, shareLinkMessage } from '../utils/shareActions';
import { buildShareMessage } from '../utils/shareMessages';

interface ShareLinkRowProps {
  link: CatalogShareLink;
  now: number;
  publicTitle: string;
  /** Sin acciones (resumen en el detalle). */
  compact?: boolean;
  reissuing?: boolean;
  onReissue?: (link: CatalogShareLink) => void;
}

export function ShareLinkRow({ link, now, publicTitle, compact, reissuing, onReissue }: ShareLinkRowProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const status = catalogShareLinkStatus(link, now);
  const shareable = isShareLinkShareable(link, now);
  const meta = [
    `v${link.versionNumber}`,
    pluralize(link.viewCount, 'vista', 'vistas'),
    `${status === 'active' ? 'vence' : 'venció'} ${formatCatalogDateTime(link.expiresAt)}`,
  ].join(' · ');

  const share = () => {
    if (!link.token) return;
    const url = buildMagazineUrl(link.token);
    void shareLinkMessage(buildShareMessage({ publicTitle, url, expiresAt: link.expiresAt }), publicTitle);
  };
  const copy = () => {
    if (!link.token) return;
    void copyLinkToClipboard(buildMagazineUrl(link.token));
  };

  return (
    <ListCard>
      <View style={styles.top}>
        <Text style={[styles.label, { color: colors.text.primary }]} numberOfLines={1}>
          {link.label}
        </Text>
        <StatusChip label={labelShareLinkStatus(status)} tone={shareLinkStatusTone(status)} />
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
              <Button title="Compartir" icon="share" size="sm" onPress={share} style={styles.action} />
              <Button title="Copiar" icon="content-copy" size="sm" variant="outline" onPress={copy} style={styles.action} />
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
  action: { flexGrow: 1, flexBasis: '30%' },
});
