import { NegociosListScreen } from '@/components/negocios/components/NegociosListScreen';
import { ScreenErrorBoundary } from '@/components/ui';

/**
 * Negocios: una sola lista con pestañas Todos / Míos / Por cobrar según el
 * rol. «Mis negocios» (`/(tabs)/mis-negocios`) redirige aquí con `alcance=mios`.
 */
export default function NegociosScreen() {
  return (
    <ScreenErrorBoundary screen="Negocios">
      <NegociosListScreen />
    </ScreenErrorBoundary>
  );
}
