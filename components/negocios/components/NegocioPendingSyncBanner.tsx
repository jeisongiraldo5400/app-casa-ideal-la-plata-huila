import { useTheme } from '@/components/theme';
import { Button, Card } from '@/components/ui';
import { IconSize, Spacing, Typography, getColors } from '@/constants/theme';
import { NEGOCIO_SYNC_BADGE } from '@/lib/negocios/negocioSyncBadge';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PendingNegocioSync } from '../domain/pendingNegocioPreview';

type Props = {
  sync: PendingNegocioSync;
  /** Abre «Cambios sin sincronizar». */
  onOpenQueue: () => void;
};

/**
 * Aviso de la ficha de un negocio creado sin señal que el servidor aún no
 * confirma: todavía no tiene número, no se puede activar ni sacar su contrato,
 * y los productos y cuotas son los que se enviarán. Si el servidor lo rechazó,
 * dice el motivo y lleva a «Cambios sin sincronizar» para reintentar o descartar.
 */
export function NegocioPendingSyncBanner({ sync, onOpenQueue }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const badge = NEGOCIO_SYNC_BADGE[sync.state];
  const rejected = sync.state === 'rejected';
  const tone = rejected ? colors.error : colors.warning;

  return (
    <View testID="negocio-pending-sync" accessibilityRole="alert">
      <Card variant="outlined" style={[styles.card, { borderColor: tone.main }]}>
      <View style={styles.row}>
        <MaterialIcons name={badge.icon} size={IconSize.md} color={tone.dark} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {badge.label} · sin número aún
          </Text>
          <Text style={[styles.helper, { color: colors.text.secondary }]}>
            {rejected
              ? 'El servidor no aceptó este negocio. No se puede activar ni generar su contrato hasta que se envíe bien.'
              : 'Guardado en el teléfono; se enviará solo cuando haya señal. Podrá activarlo y generar el contrato cuando el servidor lo confirme. Las cuotas mostradas son el plan pactado.'}
          </Text>
          {rejected && sync.reason ? (
            <Text testID="negocio-pending-sync-reason" style={[styles.reason, { color: tone.dark }]}>
              Motivo: {sync.reason}
            </Text>
          ) : null}
        </View>
      </View>
      {rejected ? (
        <Button
          title="Ver cambios sin sincronizar"
          variant="outline"
          size="sm"
          icon="sync-problem"
          onPress={onOpenQueue}
        />
      ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.lg, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  copy: { flex: 1, gap: 2 },
  title: { ...Typography.bodyStrong },
  helper: { ...Typography.caption },
  reason: { ...Typography.caption, fontWeight: '600' },
});
