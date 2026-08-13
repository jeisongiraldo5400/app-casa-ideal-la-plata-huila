import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { PrinterDevice } from '../domain/printerTransport';
import type { TicketLine } from '../domain/ticketLayout';

const STORAGE_KEY = '@casa_ideal/bluetooth_printer';

export type SavedPrinter = Pick<PrinterDevice, 'name' | 'address' | 'deviceType'>;

type PrinterState = {
  hydrated: boolean;
  savedPrinter: SavedPrinter | null;
  pickerOpen: boolean;
  pendingTicket: TicketLine[] | null;
  hydrate: () => Promise<void>;
  setSavedPrinter: (printer: SavedPrinter | null) => Promise<void>;
  setPickerOpen: (open: boolean) => void;
  setPendingTicket: (ticket: TicketLine[] | null) => void;
};

export const usePrinterStore = create<PrinterState>((set, get) => ({
  hydrated: false,
  savedPrinter: null,
  pickerOpen: false,
  pendingTicket: null,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ hydrated: true, savedPrinter: null });
        return;
      }
      const parsed = JSON.parse(raw) as SavedPrinter;
      if (!parsed?.address) {
        set({ hydrated: true, savedPrinter: null });
        return;
      }
      set({ hydrated: true, savedPrinter: parsed });
    } catch {
      set({ hydrated: true, savedPrinter: null });
    }
  },
  setSavedPrinter: async (printer) => {
    set({ savedPrinter: printer });
    if (!printer) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(printer));
  },
  setPickerOpen: (open) => set({ pickerOpen: open }),
  setPendingTicket: (ticket) => set({ pendingTicket: ticket }),
}));
