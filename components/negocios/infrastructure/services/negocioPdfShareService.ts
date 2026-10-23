import { Share } from 'react-native';
import * as Print from 'expo-print';
import { formatCOP } from '@/lib/creditCalculator';
import { buildNegocioContractHtml, NEGOCIO_CONTRACT_PDF_SIZE, type NegocioContractData } from '@/lib/negocioContractHtml';
import { buildNegocioReceiptHtml, type NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { labelNegocioCodigo } from '@/lib/negocioLabels';
import { LETTER_PDF_SIZE, pdfPrintOptions } from '@/lib/pdfPrintOptions';
import { contractPdfFileName, receiptPdfFileName, sharePdf } from '@/lib/sharing/sharePdf';

/**
 * PDF del contrato y de los recibos por la hoja de compartir (WhatsApp,
 * guardar, imprimir desde el teléfono).
 *
 * Solo el papel cuenta como impresión (decisión 2026-10-23): compartir el PDF
 * no registra copia, ni con red ni en la cola sin señal, y el PDF sale sin
 * «COPIA N.º X». Las marcas de anulado sí salen (dependen del estado).
 */

/** Contrato en tamaño oficio, el mismo de la web (NEGOCIO_CONTRACT_PDF_SIZE). */
export async function shareNegocioContractPdf(data: Omit<NegocioContractData, 'copy'>): Promise<void> {
  const html = buildNegocioContractHtml({ ...data, copy: null });
  const { uri } = await Print.printToFileAsync(pdfPrintOptions(html, NEGOCIO_CONTRACT_PDF_SIZE));
  const outcome = await sharePdf({
    uri,
    fileName: contractPdfFileName(data.numero, data.customer_name),
    dialogTitle: labelNegocioCodigo(data.numero),
  });
  if (outcome !== 'unavailable') return;
  // Sin hoja de compartir en el equipo: al menos el resumen en texto.
  await Share.share({
    message: `${labelNegocioCodigo(data.numero)} — ${data.customer_name} — Total ${formatCOP(
      Number(data.total_credit)
    )}\n\n(Abra la web para imprimir el PDF completo)`,
    title: labelNegocioCodigo(data.numero),
  });
}

/** Recibo de un pago en hoja carta. */
export async function shareNegocioReceiptPdf(data: Omit<NegocioReceiptData, 'copy'>): Promise<void> {
  const html = buildNegocioReceiptHtml({ ...data, copy: null });
  const { uri } = await Print.printToFileAsync(pdfPrintOptions(html, LETTER_PDF_SIZE));
  await sharePdf({
    uri,
    fileName: receiptPdfFileName(data.receiptNumber, data.customerName),
    dialogTitle: data.receiptNumber,
  });
}
