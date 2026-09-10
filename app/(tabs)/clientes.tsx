import { CustomersScreen } from '@/components/customers';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import React from 'react';

export default function ClientesScreen() {
  return (
    <ScreenErrorBoundary screen="Clientes">
      <CustomersScreen />
    </ScreenErrorBoundary>
  );
}
