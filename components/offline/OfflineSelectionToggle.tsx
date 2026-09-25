import { Button, StatusChip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useOfflineSelection,
  type SyncPrefDomain,
} from './infrastructure/syncPrefsService';

type Props = {
  domain: SyncPrefDomain;
  id: string;
  /** En filas de lista: chip y botón pequeños en una sola línea. */
  compact?: boolean;
};

/**
 * «Llevar en el teléfono / Quitar del teléfono» + chip «En el teléfono».
 *
 * Solo aparece si el servidor admite la descarga selectiva y el dominio está en
 * «Elegir» (las órdenes siempre lo están): en modo «Todos» ya va todo y el
 * botón solo confundiría. Marcar no descarga: hasta pulsar «Descargar» el chip
 * dice «Pendiente de descargar».
 */
export function OfflineSelectionToggle({ domain, id, compact = false }: Props) {
  const selection = useOfflineSelection(domain);
  if (!selection.supported || selection.mode !== 'seleccion') return null;

  const selected = selection.isSelected(id);
  const busy = selection.isBusy(id);

  return (
    <View style={[styles.row, compact && styles.compact]} testID={`offline-toggle-${id}`}>
      {selected ? (
        selection.pendingDownload ? (
          <StatusChip label="Pendiente de descargar" tone="warning" icon="schedule" />
        ) : (
          <StatusChip label="En el teléfono" tone="success" icon="offline-pin" />
        )
      ) : null}
      <Button
        title={selected ? 'Quitar del teléfono' : 'Llevar en el teléfono'}
        icon={selected ? 'phonelink-erase' : 'download-for-offline'}
        variant={selected ? 'ghost' : 'outline'}
        size="sm"
        loading={busy}
        disabled={busy}
        onPress={() => void selection.toggle(id)}
        accessibilityLabel={selected ? 'Quitar del teléfono' : 'Llevar en el teléfono'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm },
  compact: { marginTop: Spacing.xs },
});
