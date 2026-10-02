import { WarehousesScreen } from '@/components/warehouses';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import React from 'react';

/** Bodegas del usuario: todas para el admin, las que tiene a cargo para los demás. */
export default function BodegasScreen() {
  return (
    <ScreenErrorBoundary screen="Bodegas">
      <WarehousesScreen />
    </ScreenErrorBoundary>
  );
}
