import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { CatalogShareLink } from '@/lib/catalogos/types';
import { ShareLinkRow } from './ShareLinkRow';

interface ShareLinksPanelProps {
  links: CatalogShareLink[];
  now: number;
  publicTitle: string;
  reissuingId: string | null;
  onReissue: (link: CatalogShareLink) => void;
}

export function ShareLinksPanel({ links, now, publicTitle, reissuingId, onReissue }: ShareLinksPanelProps) {
  if (links.length === 0) {
    return <ScreenState icon="link-off" title="Aún no hay enlaces" description="Genera el primero para entregar esta edición a un cliente." variant="inline" />;
  }
  return (
    <View style={styles.list}>
      {links.map((link) => (
        <ShareLinkRow key={link.id} link={link} now={now} publicTitle={publicTitle} reissuing={reissuingId === link.id} onReissue={onReissue} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.md },
});
