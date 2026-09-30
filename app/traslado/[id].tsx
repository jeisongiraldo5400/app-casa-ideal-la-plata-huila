import { TransferDetailScreen, parseModeParam } from '@/components/transfers';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Detalle de un traslado: despachar, recibir o confirmar devolución según estado y permisos. */
export default function TrasladoDetalleScreen() {
  const { id, modo } = useLocalSearchParams<{ id?: string; modo?: string }>();
  return (
    <ScreenErrorBoundary screen="Traslado">
      <TransferDetailScreen transferOrderId={id ?? null} preferredMode={parseModeParam(modo)} />
    </ScreenErrorBoundary>
  );
}
