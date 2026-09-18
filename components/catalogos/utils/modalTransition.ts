import { Platform } from 'react-native';

/** Margen para la animación `fade` con la que iOS retira un `Modal`. */
export const IOS_MODAL_DISMISS_MS = 450;

/**
 * iOS no presenta un `Modal` mientras otro se está retirando (lo ignora en
 * silencio). Tras cerrar una hoja, esperar esto antes de abrir la siguiente.
 * Android apila modales sin problema.
 */
export function waitForModalDismissal(platform: string = Platform.OS): Promise<void> {
  if (platform !== 'ios') return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, IOS_MODAL_DISMISS_MS));
}
