import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button } from '@/components/ui';
import { errorMessage } from '@/lib/errorMessage';
import { archiveOwnCatalog } from '../infrastructure/services/catalogsService';

interface ArchiveCatalogButtonProps {
  catalogId: string;
  internalTitle: string;
  onArchived: () => void;
}

/** Archiva el catálogo propio: revoca todos sus enlaces y lo saca de la lista. */
export function ArchiveCatalogButton({ catalogId, internalTitle, onArchived }: ArchiveCatalogButtonProps) {
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    Alert.alert(
      'Archivar catálogo',
      `«${internalTitle}» dejará de estar disponible y todos sus enlaces se revocarán. Esta acción no se puede deshacer desde la app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            archiveOwnCatalog(catalogId)
              .then(onArchived)
              .catch((caught: unknown) => Alert.alert('No se pudo archivar', errorMessage(caught)))
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  return <Button title="Archivar catálogo" icon="archive" variant="destructive" onPress={confirm} loading={busy} />;
}
