import { MyOrdersScreen } from '@/components/my-orders/components/MyOrdersScreen';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function MyOrdersRoute() {
  return (
    <ScreenErrorBoundary screen="Mis órdenes">
      <MyOrdersScreen />
    </ScreenErrorBoundary>
  );
}
