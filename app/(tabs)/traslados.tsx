import { TransfersScreen } from '@/components/transfers';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import React from 'react';

/** Traslados por sacar, por recibir y devoluciones por confirmar. */
export default function TrasladosScreen() {
  return (
    <ScreenErrorBoundary screen="Traslados">
      <TransfersScreen />
    </ScreenErrorBoundary>
  );
}
