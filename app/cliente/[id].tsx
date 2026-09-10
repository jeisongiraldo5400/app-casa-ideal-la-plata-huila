import { CustomerDetailScreen } from '@/components/customers';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function ClienteDetalleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <ScreenErrorBoundary screen="Cliente">
      <CustomerDetailScreen customerId={id ?? null} />
    </ScreenErrorBoundary>
  );
}
