import { useEffect, useState } from 'react';

/**
 * Retrasa el encendido de una señal y la apaga de inmediato.
 *
 * Por qué: una carga de 80 ms que enciende y apaga un aviso se ve como un
 * parpadeo y molesta más que esperar. Solo se avisa cuando la espera ya es
 * perceptible (~200 ms); al terminar, el aviso desaparece sin retardo para que
 * la pantalla no parezca seguir ocupada.
 */
export function useDelayedVisible(active: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}
