import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { NegocioReceiptData } from '@/lib/negocioReceiptHtml';
import { buildNegocioTicket, type NegocioTicketData } from '../domain/buildNegocioTicket';
import { buildPaymentTicket, buildTestTicket } from '../domain/buildPaymentTicket';
import type { TicketLine } from '../domain/ticketLayout';
import {
  disconnectPrinter,
  mapPrinterError,
  printTicket as sendTicket,
} from '../services/printerService';
import { usePrinterStore, type SavedPrinter } from '../store/printerStore';

export function useBluetoothPrinter() {
  const savedPrinter = usePrinterStore((state) => state.savedPrinter);
  const pickerOpen = usePrinterStore((state) => state.pickerOpen);
  const hydrate = usePrinterStore((state) => state.hydrate);
  const setPickerOpen = usePrinterStore((state) => state.setPickerOpen);
  const setPendingTicket = usePrinterStore((state) => state.setPendingTicket);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const printLines = useCallback(
    async (ticket: TicketLine[]) => {
      const printer = usePrinterStore.getState().savedPrinter;
      if (!printer) {
        setPendingTicket(ticket);
        setPickerOpen(true);
        return;
      }

      setPrinting(true);
      try {
        await sendTicket(printer.address, ticket);
      } catch (error) {
        Alert.alert('No se pudo imprimir', mapPrinterError(error));
      } finally {
        setPrinting(false);
      }
    },
    [setPendingTicket, setPickerOpen]
  );

  const printPayment = useCallback(
    async (data: NegocioReceiptData) => {
      await printLines(buildPaymentTicket(data));
    },
    [printLines]
  );

  const printNegocio = useCallback(
    async (data: NegocioTicketData) => {
      await printLines(buildNegocioTicket(data));
    },
    [printLines]
  );

  const printTest = useCallback(async () => {
    await printLines(buildTestTicket());
  }, [printLines]);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
  }, [setPickerOpen]);

  const forgetPrinter = useCallback(async () => {
    const printer = usePrinterStore.getState().savedPrinter;
    if (printer) {
      await disconnectPrinter(printer.address).catch(() => undefined);
    }
    await usePrinterStore.getState().setSavedPrinter(null);
  }, []);

  return {
    savedPrinter,
    pickerOpen,
    printing,
    printPayment,
    printNegocio,
    printTest,
    openPicker,
    forgetPrinter,
  };
}

export type { SavedPrinter };
