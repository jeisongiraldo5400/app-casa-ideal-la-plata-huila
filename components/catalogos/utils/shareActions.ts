import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Share } from 'react-native';
import { errorMessage } from '@/lib/errorMessage';
import { buildWhatsAppUrl } from './shareMessages';

// Acciones nativas del enlace. Ninguna registra la URL en consola ni en
// Sentry: el token es el acceso del cliente.

export async function shareLinkMessage(message: string, title: string): Promise<void> {
  try {
    await Share.share({ message, title });
  } catch (caught) {
    Alert.alert('No se pudo compartir', errorMessage(caught));
  }
}

export async function shareLinkByWhatsApp(message: string): Promise<void> {
  const url = buildWhatsAppUrl(message);
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo. Usa «Compartir» para enviarlo por otro medio.');
      return;
    }
    await Linking.openURL(url);
  } catch (caught) {
    Alert.alert('No se pudo abrir WhatsApp', errorMessage(caught));
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
