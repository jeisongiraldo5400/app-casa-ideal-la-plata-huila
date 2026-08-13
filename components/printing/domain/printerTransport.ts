export type PrinterDeviceType = 'bt' | 'ble' | 'dual' | 'unknown';

export type PrinterDevice = {
  name: string;
  address: string;
  deviceType: PrinterDeviceType;
  rssi?: number;
};

export type AppPlatform = 'ios' | 'android' | 'web';

const THERMAL_PRINTER_NAME = /pt-?210|goojprt|caysn|rpp\d|rongta|mtp-?|pos[_-]?printer/i;
const UUID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

export function looksLikePt210(name: string | null | undefined): boolean {
  return THERMAL_PRINTER_NAME.test(String(name ?? ''));
}

export function isBleAddress(address: string): boolean {
  return address.startsWith('ble:');
}

export function isClassicAddress(address: string): boolean {
  return address.startsWith('bt:');
}

/**
 * The native scanner returns a raw UUID (iOS) or MAC (Android). The driver
 * requires ble:/bt:/lan: prefixes; a bare UUID is parsed as LAN and hangs.
 */
export function normalizePrinterAddress(
  device: Pick<PrinterDevice, 'address' | 'deviceType'>,
  platform: AppPlatform
): string {
  const raw = device.address.trim();
  if (/^(ble|bt|lan|tcp):/i.test(raw)) return raw;

  if (UUID_PATTERN.test(raw) || device.deviceType === 'ble') {
    return `ble:${raw}`;
  }

  if (platform === 'ios') {
    return `ble:${raw}`;
  }

  if (MAC_PATTERN.test(raw) || device.deviceType === 'bt' || device.deviceType === 'dual') {
    return `bt:${raw}`;
  }

  return `bt:${raw}`;
}

/**
 * iOS cannot use Bluetooth Classic SPP. The PT-210 is BT 4.0 and typically
 * exposes BLE for iPhone (Printer-x). Android uses Classic SPP.
 */
export function isUsableOnPlatform(device: PrinterDevice, platform: AppPlatform): boolean {
  if (platform === 'web') return false;
  if (platform !== 'ios') return true;
  return device.deviceType === 'ble' || device.deviceType === 'dual' || isBleAddress(device.address);
}

export function filterDevicesForPlatform(
  devices: PrinterDevice[],
  platform: AppPlatform
): PrinterDevice[] {
  return devices.filter((device) => isUsableOnPlatform(device, platform));
}

export function iosClassicOnlyHint(devices: PrinterDevice[], platform: AppPlatform): boolean {
  if (platform !== 'ios' || devices.length === 0) return false;
  return filterDevicesForPlatform(devices, platform).length === 0;
}

export const IOS_BLE_UNAVAILABLE_MESSAGE =
  'Esta impresora no es visible por Bluetooth en iPhone. La PT-210 debe aparecer como BLE. En Android funciona con Bluetooth clásico.';
