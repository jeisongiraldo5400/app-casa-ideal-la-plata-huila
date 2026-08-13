import { Platform } from 'react-native';
import ThermalPrinter, {
  ErrorCode,
  ThermalPrinterError,
  feed,
  line,
  text,
  type Device,
  type Node,
} from 'react-native-thermal-printer-driver';
import { sanitizeForEscPos } from '../domain/escposEncoding';
import {
  IOS_BLE_UNAVAILABLE_MESSAGE,
  filterDevicesForPlatform,
  iosClassicOnlyHint,
  normalizePrinterAddress,
  type AppPlatform,
  type PrinterDevice,
} from '../domain/printerTransport';
import type { TicketLine } from '../domain/ticketLayout';

const PRINT_OPTIONS = {
  paperWidthMm: 58 as const,
  codePage: 'cp850' as const,
  disableCutPaper: true,
  keepAlive: true,
  timeout: 15000,
};

function currentPlatform(): AppPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function toPrinterDevice(device: Device): PrinterDevice {
  const deviceType = device.deviceType;
  return {
    name: device.name || 'Impresora',
    address: normalizePrinterAddress(
      { address: device.address, deviceType },
      currentPlatform()
    ),
    deviceType,
    rssi: device.rssi,
  };
}

function uniqueDevices(devices: PrinterDevice[]): PrinterDevice[] {
  const seen = new Set<string>();
  const result: PrinterDevice[] = [];
  for (const device of devices) {
    if (seen.has(device.address)) continue;
    seen.add(device.address);
    result.push(device);
  }
  return result;
}

export function mapPrinterError(error: unknown): string {
  if (error instanceof ThermalPrinterError) {
    switch (error.code) {
      case ErrorCode.BLUETOOTH_DISABLED:
        return 'Active Bluetooth en el celular e intente de nuevo.';
      case ErrorCode.BLUETOOTH_NOT_SUPPORTED:
        return 'Este celular no soporta Bluetooth para impresoras.';
      case ErrorCode.BLUETOOTH_PERMISSION_DENIED:
        return 'Permita el acceso a Bluetooth (y ubicación en Android) para buscar la impresora.';
      case ErrorCode.DEVICE_NOT_FOUND:
        return 'No se encontró la impresora. Enciéndala, acérquela y vuelva a escanear.';
      case ErrorCode.CONNECTION_TIMEOUT:
      case ErrorCode.CONNECTION_FAILED:
        return 'No se pudo conectar. Elija la impresora (RPP02N / PT-210), enciéndala y manténgala cerca.';
      case ErrorCode.CONNECTION_LOST:
        return 'Se perdió la conexión con la impresora. Vuelva a vincularla.';
      case ErrorCode.WRITE_FAILED:
      case ErrorCode.PRINT_TIMEOUT:
        return 'La impresora no recibió el ticket. Verifique el papel y reintente.';
      case ErrorCode.UNSUPPORTED_TRANSPORT:
        return IOS_BLE_UNAVAILABLE_MESSAGE;
      default:
        return error.message || 'No se pudo imprimir.';
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo imprimir.';
}

function ticketToNodes(ticket: TicketLine[]): Node[] {
  const nodes: Node[] = [];

  for (const item of ticket) {
    if (item.type === 'separator') {
      nodes.push(line({ style: 'dashed' }));
      continue;
    }
    if (item.type === 'spacer') {
      nodes.push(feed(item.lines ?? 1));
      continue;
    }

    nodes.push(
      text(sanitizeForEscPos(item.text), {
        align: item.align,
        bold: item.bold,
        size: item.size,
      })
    );
  }

  nodes.push(feed(3));
  return nodes;
}

export async function scanPrinters(): Promise<{
  devices: PrinterDevice[];
  iosClassicOnly: boolean;
}> {
  if (currentPlatform() === 'web') {
    throw new Error('La impresión Bluetooth no está disponible en web.');
  }

  const result = await ThermalPrinter.scan();
  const all = uniqueDevices([
    ...(result.paired ?? []).map(toPrinterDevice),
    ...(result.found ?? []).map(toPrinterDevice),
  ]);
  const platform = currentPlatform();
  return {
    devices: filterDevicesForPlatform(all, platform),
    iosClassicOnly: iosClassicOnlyHint(all, platform),
  };
}

export async function stopPrinterScan(): Promise<void> {
  try {
    await ThermalPrinter.stopScan();
  } catch {
    // ignore
  }
}

export async function connectPrinter(address: string): Promise<void> {
  await stopPrinterScan();
  await ThermalPrinter.connect(address, { timeout: 20000 });
}

export async function disconnectPrinter(address?: string): Promise<void> {
  await ThermalPrinter.disconnect(address);
}

export async function printTicket(address: string, ticket: TicketLine[]): Promise<void> {
  await connectPrinter(address);
  const result = await ThermalPrinter.print(address, ticketToNodes(ticket), PRINT_OPTIONS);
  if (!result.success) {
    throw new Error(result.error?.message || 'La impresora no completo la impresion.');
  }
}
