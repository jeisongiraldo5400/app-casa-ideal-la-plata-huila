import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Share } from 'react-native';
import { errorMessage } from '@/lib/errorMessage';
import { buildWhatsAppAppUrl, buildWhatsAppUrl } from './shareMessages';

// Acciones nativas del enlace. Ninguna registra la URL en consola ni en
// Sentry: el token es el acceso del cliente.

export async function shareLinkMessage(message: string, title: string): Promise<void> {
  try {
    await Share.share({ message, title });
  } catch (caught) {
    Alert.alert('No se pudo compartir', errorMessage(caught));
  }
}

/** `app`: se abrió WhatsApp; `web`: se abrió wa.me en el navegador; `unavailable`: no se abrió nada (ya se avisó). */
export type WhatsAppOutcome = 'app' | 'web' | 'unavailable';

/**
 * Intenta primero la app (`whatsapp://`) y, si no abre, `wa.me`. No se
 * consulta `canOpenURL`: para `https` siempre responde que sí (lo abre el
 * navegador) y para `whatsapp://` exigiría declarar el esquema en la build
 * nativa; `openURL` ya rechaza cuando nadie puede abrir la URL.
 */
export async function shareLinkByWhatsApp(message: string): Promise<WhatsAppOutcome> {
  try {
    await Linking.openURL(buildWhatsAppAppUrl(message));
    return 'app';
  } catch {
    // Sin la app: se intenta la versión web.
  }
  try {
    await Linking.openURL(buildWhatsAppUrl(message));
    return 'web';
  } catch {
    // El error de `openURL` incluye la URL (con el token): no se muestra.
    Alert.alert('No se pudo abrir WhatsApp', 'Usa «Copiar» o «Compartir» para enviarlo por otro medio.');
    return 'unavailable';
  }
}

export async function copyLinkToClipboard(url: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(url);
    return true;
  } catch (caught) {
    Alert.alert('No se pudo copiar', errorMessage(caught));
    return false;
  }
}

export async function openLinkInBrowser(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch (caught) {
    Alert.alert('No se pudo abrir la revista', errorMessage(caught));
  }
}
