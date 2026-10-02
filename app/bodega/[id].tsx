import { WarehouseDetailScreen, parseWarehouseTabParam } from '@/components/warehouses';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Detalle de una bodega: productos, traslados en camino e historial. */
export default function BodegaDetalleScreen() {
  const { id, nombre, pestana } = useLocalSearchParams<{ id?: string; nombre?: string; pestana?: string }>();
  return (
    <ScreenErrorBoundary screen="Bodega">
      <WarehouseDetailScreen
        warehouseId={id ?? null}
        warehouseName={nombre ?? null}
        initialTab={parseWarehouseTabParam(pestana)}
      />
    </ScreenErrorBoundary>
  );
}
