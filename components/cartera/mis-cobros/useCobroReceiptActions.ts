import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as Print from 'expo-print';
import { useBluetoothPrinter } from '@/components/printing';
import { buildNegocioReceiptHtml, type NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { LETTER_PDF_SIZE, pdfPrintOptions } from '@/lib/pdfPrintOptions';
import { openPagoSupport } from '@/lib/uploadPagoSupport';
import { errorMessage } from '@/lib/errorMessage';
import type { MisCobroRow } from '@/lib/cartera/misCobros';
import { recordNegocioPrint } from '@/components/negocios/infrastructure/services/negocioPrintService';
import { fetchNegocioReceiptProducts } from '@/components/negocios/infrastructure/services/negocioProductLinesService';
import { fetchNegocioCustomerPhones } from '@/components/negocios/infrastructure/services/negocioCustomerPhonesService';
import { receiptPdfFileName, sharePdfToWhatsApp } from '@/lib/sharing/sharePdfToWhatsApp';

/** Pago ya confirmado por el servidor (solo esos tienen recibo en «Cobros»). */
type CobroPrintTarget = Pick<MisCobroRow, 'negocio_id' | 'payment_id'>;

const recordCobroPrint = (target: CobroPrintTarget, format: 'pdf' | 'ticket') =>
  recordNegocioPrint({ negocioId: target.negocio_id, document: 'recibo', format, pagoId: target.payment_id });

/**
 * Acciones sobre el recibo de un cobro (antes solo en el modal «Cobros de …»):
 * enviar el PDF (por WhatsApp en Android), reimprimir el ticket por Bluetooth y abrir el soporte.
 */
export function useCobroReceiptActions() {
  const { printPayment, printing } = useBluetoothPrinter();

  const shareReceipt = useCallback(async (data: NegocioReceiptData, target: CobroPrintTarget) => {
    try {
      // Los productos del negocio no vienen en la fila del cobro: se leen al
      // imprimir (servidor o teléfono), a la vez que se registra la copia y
      // se buscan los teléfonos del cliente para enviarle el PDF por WhatsApp.
      const [copy, products, phones] = await Promise.all([
        recordCobroPrint(target, 'pdf'),
        fetchNegocioReceiptProducts(target.negocio_id),
        fetchNegocioCustomerPhones(target.negocio_id),
      ]);
      const html = buildNegocioReceiptHtml({ ...data, products, copy });
      const { uri } = await Print.printToFileAsync(pdfPrintOptions(html, LETTER_PDF_SIZE));
      await sharePdfToWhatsApp({
        uri,
        fileName: receiptPdfFileName(data.receiptNumber, data.customerName),
        phone: phones.phone,
        phoneSecondary: phones.phoneSecondary,
        dialogTitle: data.receiptNumber,
      });
    } catch (e) {
      Alert.alert('Error', errorMessage(e, 'No fue posible compartir el recibo'));
    }
  }, []);

  const printReceipt = useCallback(
    async (data: NegocioReceiptData, target: CobroPrintTarget) => {
      const products = await fetchNegocioReceiptProducts(target.negocio_id);
      await printPayment({ ...data, products }, { resolveCopy: () => recordCobroPrint(target, 'ticket') });
    },
    [printPayment]
  );

  const openSupport = useCallback(async (path: string) => {
    try {
      await openPagoSupport(path);
    } catch (e) {
      Alert.alert('Error', errorMessage(e, 'No se pudo abrir el soporte'));
    }
  }, []);

  return { shareReceipt, printReceipt, openSupport, printing };
}
