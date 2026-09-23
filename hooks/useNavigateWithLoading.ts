import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { startNavigationLoading } from '@/lib/ui/loadingStore';

type Href = Parameters<ReturnType<typeof useRouter>['navigate']>[0];

/**
 * Navega avisando al indicador global desde el mismo toque.
 *
 * Por qué no basta con que la pantalla destino avise: entre el toque y el
 * primer render del destino hay un hueco (montaje de la pantalla, resolución de
 * roles) en el que no pasa nada visible y el usuario vuelve a tocar. Encender
 * el aviso en el propio `onPress` cierra ese hueco.
 */
export function useNavigateWithLoading() {
  const router = useRouter();

  return useCallback(
    (href: Href) => {
      startNavigationLoading();
      router.navigate(href);
    },
    [router],
  );
}
