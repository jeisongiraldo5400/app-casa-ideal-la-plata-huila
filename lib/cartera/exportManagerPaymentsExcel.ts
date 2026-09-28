import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { paymentSiteLabel } from '@/lib/paymentSite';
import { fetchPaymentMethods } from '@/components/negocios/infrastructure/services/paymentMethodsService';
import type {
  ManagerPayment,
  ManagerPaymentMethodTotal,
  ManagerPaymentsSummary,
} from '@/lib/cartera/carteraService';
import { pagosScopeTitle, type CarteraPagosScope, type MisCobrosFilters } from '@/lib/cartera/misCobros';
import { requestCarteraPayments } from '@/lib/cartera/misCobrosService';

const PAGE_SIZE = 50;
const MAX_ROWS = 10_000;

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

/** Pesos colombianos sin decimales, como en el resto de la app. */
export const MONEY_FORMAT = '"$"#,##0';
export const DATE_TIME_FORMAT = 'dd/mm/yyyy hh:mm';
export const DATE_FORMAT = 'dd/mm/yyyy';

/** Colombia no tiene horario de verano: America/Bogota es siempre UTC−5. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;
/** Días entre el 1899-12-30 (día 0 de Excel) y el 1970-01-01. */
const EXCEL_UNIX_EPOCH_DAYS = 25_569;

const SITE_LABEL: Record<string, string> = {
  almacen: 'Almacén',
  app_movil: 'Aplicación Móvil',
  sin_registro: 'Sitio no registrado',
};

export const DETAIL_SHEET_NAME = 'Cobros';
export const SUMMARY_SHEET_NAME = 'Resumen';
export const METHODS_SHEET_NAME = 'Por método';
export const METHODS_HEADER = ['Método de pago', 'Efectivo', 'Pagos', 'Total', 'Descuento pronto pago'] as const;

export const DETAIL_HEADER = [
  'Fecha y hora pago',
  'Código negocio',
  'Cliente',
  'Cuota',
  'Recibo virtual',
  'Recibo físico',
  'Estado recibo',
  'Tipo',
  'Valor',
  'Descuento',
  'Saldo pendiente negocio',
  'Método de pago',
  'Sitio de pago',
  'Registrado por',
  'Gestor de cobro',
  'Tiene soporte',
] as const;

/** Ancho (en caracteres) de cada columna de DETAIL_HEADER, en el mismo orden. */
const DETAIL_WIDTHS = [18, 14, 30, 12, 16, 14, 13, 12, 14, 14, 22, 18, 17, 24, 24, 13];

/** Contexto del reporte: alcance del servidor y nombres para la hoja «Resumen». */
export type CarteraPagosExcelContext = {
  scope: CarteraPagosScope;
  /** Nombres de los métodos elegidos. */
  paymentMethodsLabel?: string;
};

/**
 * Serial de fecha de Excel con la hora de pared de Bogotá (la misma que muestra
 * la app), independiente de la zona horaria del teléfono. `null` si no es fecha.
 */
export function toExcelDateSerial(value: string | Date | null | undefined): number | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return (ms - BOGOTA_OFFSET_MS) / MS_PER_DAY + EXCEL_UNIX_EPOCH_DAYS;
}

/** Serial de un día calendario `YYYY-MM-DD` (sin hora ni zona). */
function calendarDaySerial(day: string): number | null {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms / MS_PER_DAY + EXCEL_UNIX_EPOCH_DAYS;
}

function dateCell(serial: number | null, format: string, fallback: string): XLSX.CellObject {
  return serial == null ? { t: 's', v: fallback } : { t: 'n', v: serial, z: format };
}

function moneyCell(value: number | string | null | undefined): XLSX.CellObject {
  return { t: 'n', v: Number(value || 0), z: MONEY_FORMAT };
}

/** Hoja a partir de filas cuyas celdas pueden ser valores sueltos o CellObject. */
function sheetFromRows(rows: (XLSX.CellObject | string | number)[][]): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  let maxCol = 0;
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      const cell: XLSX.CellObject =
        typeof value === 'object'
          ? value
          : typeof value === 'number'
            ? { t: 'n', v: value }
            : { t: 's', v: value };
      sheet[XLSX.utils.encode_cell({ r, c })] = cell;
      maxCol = Math.max(maxCol, c);
    });
  });
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(rows.length - 1, 0), c: maxCol },
  });
  return sheet;
}

/** «Pronto pago» o «Abono» (los pagos sin tipo son abonos). */
export function paymentKindLabel(kind: string | null | undefined) {
  return kind === 'pronto_pago' ? 'Pronto pago' : 'Abono';
}

function receiptStatusLabel(status: ManagerPayment['receipt_status']) {
  return status === 'anulado' ? 'Anulado' : 'Vigente';
}

/**
 * Nombres de método por id para las filas que traen `payment_method_id` sin
 * `payment_method_name`. El RPC ya resuelve el nombre, así que solo se consulta
 * el catálogo (con respaldo offline) si falta en alguna fila; si falla, la
 * columna queda vacía en vez de bloquear la exportación.
 */
async function resolveMissingMethodNames(rows: ManagerPayment[]) {
  const names = new Map<string, string>();
  if (!rows.some((row) => row.payment_method_id && !row.payment_method_name)) {
    return names;
  }
  try {
    for (const method of await fetchPaymentMethods()) names.set(method.id, method.name);
  } catch (error) {
    console.warn('No fue posible cargar los métodos de pago para el Excel', error);
  }
  return names;
}

function paymentMethodLabel(payment: ManagerPayment, names: Map<string, string>) {
  if (payment.payment_method_name) return payment.payment_method_name;
  if (payment.payment_method_id) return names.get(payment.payment_method_id) || '';
  return '';
}

/**
 * Desglose por método para la hoja «Por método»: el del servidor
 * (`summary.by_method`, sobre todo el filtro) o, con un servidor anterior, el
 * de las filas exportadas vigentes. Mismo orden: mayor total primero.
 */
export function managerPaymentsByMethod(
  summary: ManagerPaymentsSummary,
  rows: ManagerPayment[],
  names: Map<string, string> = new Map()
): ManagerPaymentMethodTotal[] {
  if (Array.isArray(summary.by_method)) return summary.by_method;
  const groups = new Map<string, { item: ManagerPaymentMethodTotal; cents: number; discountCents: number }>();
  for (const payment of rows) {
    if (payment.receipt_status === 'anulado') continue;
    const key = payment.payment_method_id ?? '';
    let group = groups.get(key);
    if (!group) {
      const name = paymentMethodLabel(payment, names) || null;
      group = {
        item: { payment_method_id: payment.payment_method_id ?? null, payment_method_name: name, is_cash: null, count: 0, total: 0, total_discount: 0 },
        cents: 0,
        discountCents: 0,
      };
      groups.set(key, group);
    }
    group.item.count += 1;
    group.cents += Math.round(Number(payment.amount || 0) * 100);
    group.discountCents += Math.round(Number(payment.discount_amount || 0) * 100);
  }
  return [...groups.values()]
    .map(({ item, cents, discountCents }) => ({ ...item, total: cents / 100, total_discount: discountCents / 100 }))
    .sort((a, b) => Number(b.total) - Number(a.total));
}

function methodSheetName(method: ManagerPaymentMethodTotal) {
  if (method.payment_method_name) return method.payment_method_name;
  return method.payment_method_id ? 'Método sin nombre' : 'Sin método';
}

/** Todas las filas del filtro (páginas de 50 de `list_cartera_payments`, tope 10.000). */
export async function fetchAllCarteraPayments(filters: MisCobrosFilters) {
  const allRows: ManagerPayment[] = [];
  let page = 1;
  let summary: ManagerPaymentsSummary | null = null;

  while (allRows.length < MAX_ROWS) {
    const response = await requestCarteraPayments(filters, page, PAGE_SIZE);
    const result = {
      summary: (response.summary || {}) as unknown as ManagerPaymentsSummary,
      rows: (response.rows || []) as unknown as ManagerPayment[],
    };
    if (!summary) summary = result.summary;
    allRows.push(...result.rows);
    const total = Number(result.summary.total_count || 0);
    if (allRows.length >= total || result.rows.length < PAGE_SIZE) break;
    page += 1;
  }

  return {
    summary: summary || {
      total_count: 0,
      valid_count: 0,
      voided_count: 0,
      total_collected: 0,
      average_payment: 0,
      last_payment_date: null,
    },
    rows: allRows,
  };
}

/**
 * Libro con la hoja «Cobros» (primera, encabezado en la fila 1 con autofiltro)
 * y la hoja «Resumen» con los filtros y totales. Montos como números con
 * formato de moneda y fechas como fechas reales de Excel.
 */
export function buildManagerPaymentsWorkbook(options: {
  filters: MisCobrosFilters;
  context: CarteraPagosExcelContext;
  summary: ManagerPaymentsSummary;
  rows: ManagerPayment[];
  methodNames?: Map<string, string>;
  generatedAt?: Date;
}): XLSX.WorkBook {
  const { filters, context, summary, rows } = options;
  const methodNames = options.methodNames ?? new Map<string, string>();
  const generatedAt = options.generatedAt ?? new Date();

  const detailRows = rows.map((payment) => {
    const cells: (XLSX.CellObject | string | number)[] = [
      dateCell(toExcelDateSerial(payment.paid_at), DATE_TIME_FORMAT, ''),
      formatNegocioCodigo(payment.negocio_numero),
      payment.customer_name || '',
      payment.cuota_label?.trim()
        ? payment.cuota_label.trim()
        : payment.installment_number != null
          ? Number(payment.installment_number)
          : 'Auto (FIFO)',
      payment.virtual_receipt_number || '',
      payment.receipt_number || '',
      receiptStatusLabel(payment.receipt_status),
      paymentKindLabel(payment.payment_kind),
      // «Valor» es dinero recibido; el descuento del pronto pago va aparte.
      moneyCell(payment.amount),
      moneyCell(payment.discount_amount),
      moneyCell(payment.remaining_balance),
      paymentMethodLabel(payment, methodNames),
      paymentSiteLabel(payment.payment_site),
      payment.created_by_name || '',
      payment.gestor_cobro_name || '',
      payment.support_path ? 'Sí' : 'No',
    ];
    return cells;
  });

  const detailSheet = sheetFromRows([[...DETAIL_HEADER], ...detailRows]);
  detailSheet['!cols'] = DETAIL_WIDTHS.map((wch) => ({ wch }));
  detailSheet['!autofilter'] = { ref: detailSheet['!ref'] as string };

  const summarySheet = sheetFromRows([
    ['REPORTE DE PAGOS DE CARTERA'],
    ['Alcance', pagosScopeTitle(context.scope)],
    ['Registrado por', filters.createdBy?.name || 'Todos'],
    ['Fecha desde', dateCell(filters.from ? calendarDaySerial(filters.from) : null, DATE_FORMAT, 'Sin filtro')],
    ['Fecha hasta', dateCell(filters.to ? calendarDaySerial(filters.to) : null, DATE_FORMAT, 'Sin filtro')],
    [
      'Estado recibo',
      filters.status === 'todos' ? 'Todos' : filters.status === 'anulados' ? 'Anulados' : 'Vigentes',
    ],
    ['Métodos de pago', context.paymentMethodsLabel || 'Todos'],
    ['Sitio de pago', (filters.site && SITE_LABEL[filters.site]) || 'Todos'],
    [
      'Cierre de recaudo',
      filters.inCierre === 'todos' ? 'Todos' : filters.inCierre === 'si' ? 'En un cierre' : 'Sin cierre',
    ],
    ['Búsqueda', filters.search || '—'],
    ['Generado', dateCell(toExcelDateSerial(generatedAt), DATE_TIME_FORMAT, '')],
    ['Total registros', Number(summary.total_count || 0)],
    ['Pagos vigentes', Number(summary.valid_count || 0)],
    ['Pagos anulados', Number(summary.voided_count || 0)],
    ['Recaudo neto', moneyCell(summary.total_collected)],
    ...(summary.total_cash != null
      ? [['Efectivo', moneyCell(summary.total_cash)] as (XLSX.CellObject | string | number)[]]
      : []),
    ['Promedio por pago', moneyCell(summary.average_payment)],
    ...(summary.total_discount != null
      ? [['Descuentos pronto pago', moneyCell(summary.total_discount)] as (XLSX.CellObject | string | number)[]]
      : []),
    ...(summary.total_voided != null
      ? [['Valor anulado (no suma)', moneyCell(summary.total_voided)] as (XLSX.CellObject | string | number)[]]
      : []),
    [
      'Último cobro',
      dateCell(toExcelDateSerial(summary.last_payment_date), DATE_TIME_FORMAT, 'Sin cobros'),
    ],
    ['Filas exportadas', rows.length],
  ]);
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 34 }];

  // «Por método»: pagos vigentes que cumplen los filtros, agrupados por método.
  const methods = managerPaymentsByMethod(summary, rows, methodNames);
  const methodsSheet = sheetFromRows([
    [...METHODS_HEADER],
    ...methods.map((method) => [
      methodSheetName(method),
      method.is_cash == null ? '' : method.is_cash ? 'Sí' : 'No',
      Number(method.count || 0),
      moneyCell(method.total),
      moneyCell(method.total_discount),
    ]),
    [
      'Total',
      '',
      methods.reduce((total, method) => total + Number(method.count || 0), 0),
      moneyCell(methods.reduce((total, method) => total + Math.round(Number(method.total || 0) * 100), 0) / 100),
      moneyCell(methods.reduce((total, method) => total + Math.round(Number(method.total_discount || 0) * 100), 0) / 100),
    ],
  ]);
  methodsSheet['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 20 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, DETAIL_SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, summarySheet, SUMMARY_SHEET_NAME);
  XLSX.utils.book_append_sheet(workbook, methodsSheet, METHODS_SHEET_NAME);
  return workbook;
}

export function carteraPagosFileName(scope: CarteraPagosScope, now: Date = new Date()) {
  const dateStamp = now.toISOString().slice(0, 10);
  return `Pagos_${scope}_${dateStamp}.xlsx`;
}

/**
 * Genera el .xlsx en el caché del dispositivo y abre el diálogo de compartir.
 * Todo ocurre en el teléfono (SheetJS en JS puro), así que no depende de red
 * más allá de la consulta de cobros.
 */
export async function exportAndShareCarteraPagosExcel(options: {
  filters: MisCobrosFilters;
  context: CarteraPagosExcelContext;
}): Promise<{ fileName: string; rowCount: number }> {
  const { filters, context } = options;
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir archivos no está disponible en este dispositivo');
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error('No hay acceso al almacenamiento temporal del dispositivo');
  }

  const { summary, rows } = await fetchAllCarteraPayments(filters);
  const methodNames = await resolveMissingMethodNames(rows);
  const workbook = buildManagerPaymentsWorkbook({ filters, context, summary, rows, methodNames });
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx', compression: true });

  const fileName = carteraPagosFileName(context.scope);
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(fileUri, {
    mimeType: XLSX_MIME_TYPE,
    dialogTitle: fileName,
    UTI: XLSX_UTI,
  });

  return { fileName, rowCount: rows.length };
}
