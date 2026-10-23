import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as Print from 'expo-print';
import {
  buildDeliveryOrderPrintHtml,
  clientSheetBlocks,
  deliveryOrderPrintFileLabel,
  type DeliveryOrderPrintData,
  type DeliveryOrderPrintLayout,
} from '@/lib/deliveryOrderPrintHtml';
import { errorMessage } from '@/lib/errorMessage';
import { LETTER_PDF_SIZE, pdfPrintOptions } from '@/lib/pdfPrintOptions';
import { sharePdf } from '@/lib/sharing/sharePdf';
import { DeliveryOrderPrintOfflineError, fetchDeliveryOrderPrintData } from '../services/deliveryOrderPrintService';

/** Una remisión con clientes deja elegir entre el documento completo y una hoja por cliente. */
export function offersClientSheets(data: Pick<DeliveryOrderPrintData, 'orderType' | 'children'>): boolean {
  return data.orderType === 'remission' && clientSheetBlocks(data).length > 0;
}

function askLayout(data: DeliveryOrderPrintData): Promise<DeliveryOrderPrintLayout | null> {
  if (!offersClientSheets(data)) return Promise.resolve('completa');
  const clients = clientSheetBlocks(data).length;
  return new Promise((resolve) => {
    Alert.alert(
      `Imprimir remisión ${data.orderNumber}`,
      `Tiene ${clients === 1 ? '1 cliente' : `${clients} clientes`}. ¿Qué desea imprimir?`,
      [
        { text: 'Documento completo', onPress: () => resolve('completa') },
        { text: 'Una hoja por cliente', onPress: () => resolve('hoja_cliente') },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

/**
 * Genera la orden de entrega o remisión como PDF carta y abre la hoja de
 * compartir (WhatsApp, impresora, guardar). Requiere conexión. No suma copia
 * ni lleva «COPIA N.º X»: solo cuenta lo impreso en papel (en la web). Una
 * orden anulada sigue saliendo con la marca ANULADA.
 */
export function useDeliveryOrderPrint() {
  const [printing, setPrinting] = useState(false);

  const printOrder = useCallback(async (orderId: string) => {
    setPrinting(true);
    try {
      const data = await fetchDeliveryOrderPrintData(orderId);
      const layout = await askLayout(data);
      if (!layout) return;
      const html = buildDeliveryOrderPrintHtml(data, { layout, printedAt: new Date().toISOString() });
      const { uri } = await Print.printToFileAsync(pdfPrintOptions(html, LETTER_PDF_SIZE));
      const outcome = await sharePdf({
        uri,
        fileName: deliveryOrderPrintFileLabel(data, layout),
        dialogTitle: data.orderNumber,
      });
      if (outcome === 'unavailable') {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      if (error instanceof DeliveryOrderPrintOfflineError) {
        Alert.alert('Sin conexión', error.message);
      } else {
        Alert.alert('Error', errorMessage(error, 'No fue posible imprimir la orden'));
      }
    } finally {
      setPrinting(false);
    }
  }, []);

  return { printOrder, printing };
}
