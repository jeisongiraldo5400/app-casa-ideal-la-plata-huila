import { RouteBuilderScreen } from '@/components/collection-routes/RouteBuilderScreen';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

export default function CreateCollectionRouteScreen() {
  return (
    <ScreenErrorBoundary screen="Crear ruta de cobro">
      <RouteBuilderScreen />
    </ScreenErrorBoundary>
  );
}
