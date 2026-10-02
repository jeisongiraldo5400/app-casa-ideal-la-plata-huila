import { Alert, Linking } from 'react-native';
import { buildWhatsAppChatAppUrl, pickCustomerWhatsApp, greetingName } from '@/lib/negocios/negocioWhatsApp';

export type ShareWithCustomerWhatsAppInput = {
  /** Título del menú, p. ej. «Compartir contrato». */
  title: string;
  customerName: string | null | undefined;
  phone: string | null | undefined;
  phoneSecondary: string | null | undefined;
  /** Texto que se escribe en el chat del cliente. */
  message: string;
  /** Lo de siempre: el PDF por la hoja de compartir del sistema. */
  sharePdf: () => void | Promise<void>;
};

/** `menu`: se ofreció WhatsApp y PDF; `no-phone`: sin celular, solo el PDF. */
export type ShareWithCustomerWhatsAppOutcome = 'menu' | 'no-phone';

/**
 * Abre el chat de WhatsApp del cliente con el mensaje escrito. Sin la app
 * instalada `openURL` rechaza (no se pregunta `canOpenURL`: en iOS exigiría
 * declarar el esquema en la build nativa) y se cae a la hoja de compartir.
 */
export async function openCustomerWhatsAppChat(
  number: string,
  message: string,
  sharePdf: () => void | Promise<void>
): Promise<boolean> {
  try {
    await Linking.openURL(buildWhatsAppChatAppUrl(number, message));
    return true;
  } catch {
    Alert.alert('WhatsApp no está instalado', 'Puede enviar el PDF por otro medio.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Compartir PDF', onPress: () => void sharePdf() },
    ]);
    return false;
  }
}

/**
 * Compartir un documento del negocio: con un celular válido del cliente, la
 * primera opción es escribirle por WhatsApp a su chat; el PDF queda como
 * segunda opción (WhatsApp no deja adjuntar un archivo a un chat concreto por
 * enlace). Sin celular, avisa y ofrece la hoja de compartir de siempre.
 */
export function shareWithCustomerWhatsApp(input: ShareWithCustomerWhatsAppInput): ShareWithCustomerWhatsAppOutcome {
  const target = pickCustomerWhatsApp(input.phone, input.phoneSecondary);
  if (!target) {
    Alert.alert(input.title, 'El cliente no tiene celular registrado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Compartir PDF', onPress: () => void input.sharePdf() },
    ]);
    return 'no-phone';
  }
  const name = greetingName(input.customerName) || 'el cliente';
  Alert.alert(input.title, `${input.customerName?.trim() || 'Cliente'} · ${target.phone}`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Compartir PDF…', onPress: () => void input.sharePdf() },
    {
      text: `WhatsApp a ${name}`,
      onPress: () => void openCustomerWhatsAppChat(target.number, input.message, input.sharePdf),
    },
  ]);
  return 'menu';
}
