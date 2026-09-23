import { useEffect, useId } from 'react';
import { useLoadingStore } from '@/lib/ui/loadingStore';

/**
 * Declara al aviso global que esta pantalla está cargando datos.
 *
 * Una línea por pantalla, junto al `loading` que ya usa para su `ScreenState`:
 * no sustituye el estado de carga propio, lo publica para que la barra superior
 * siga encendida desde el toque del menú hasta que llegan los datos.
 *
 * Se apaga sola al desmontar para que una pantalla abandonada a mitad de carga
 * no deje el aviso pegado.
 */
export function useScreenLoading(loading: boolean) {
  const id = useId();
  const setScreenLoading = useLoadingStore((state) => state.setScreenLoading);

  useEffect(() => {
    setScreenLoading(id, loading);
  }, [id, loading, setScreenLoading]);

  useEffect(() => () => setScreenLoading(id, false), [id, setScreenLoading]);
}
