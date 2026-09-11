import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import {
  DETAIL_HEADER,
  MONEY_FORMAT,
  XLSX_MIME_TYPE,
  XLSX_UTI,
  exportAndShareManagerPaymentsExcel,
  fetchAllManagerPayments,
  toExcelDateSerial,
} from '../exportManagerPaymentsExcel';
import type { CollectionManager, ManagerPayment } from '../carteraService';

const mockFetchManagerPayments = jest.fn();
const mockFetchPaymentMethods = jest.fn();

jest.mock('@/lib/cartera/carteraService', () => ({
  fetchManagerPayments: (...args: unknown[]) => mockFetchManagerPayments(...args),
}));

jest.mock('@/components/negocios/infrastructure/services/paymentMethodsService', () => ({
  fetchPaymentMethods: (...args: unknown[]) => mockFetchPaymentMethods(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const filters = {
  scope: 'performed' as const,
  negocioId: '',
  dateFrom: '2026-09-01',
  dateTo: '',
  receiptStatus: 'todos' as const,
  search: '',
};

function payment(overrides: Partial<ManagerPayment> = {}): ManagerPayment {
  return {
    paid_at: '2026-09-10T15:00:00.000Z',
    negocio_numero: 12,
    customer_name: 'Ana',
    installment_number: 1,
    virtual_receipt_number: 'RV-1',
    receipt_number: null,
    receipt_status: 'emitido',
    amount: 50_000,
    remaining_balance: 100_000,
    payment_site: 'app_movil',
    created_by_name: 'Gestor',
    currently_assigned: true,
    support_path: null,
    ...overrides,
  } as ManagerPayment;
}

function summary(total: number) {
  return {
    total_count: total,
    valid_count: total,
    voided_count: 0,
    total_collected: total * 50_000,
    average_payment: 50_000,
    last_payment_date: null,
  };
}

/** Lee el libro que se escribió en el caché, con la misma librería. */
function writtenWorkbook() {
  const [, base64, options] = jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0];
  expect(options).toEqual({ encoding: 'base64' });
  // cellStyles: SheetJS solo lee de vuelta los anchos (`!cols`) con esta opción.
  return XLSX.read(base64, { type: 'base64', cellNF: true, cellStyles: true });
}

/** Encabezado, filas (valores crudos por columna) y la hoja de detalle. */
function detailTable(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets.Cobros;
  const [header, ...lines] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });
  const rows = lines.map((line) =>
    Object.fromEntries((header as string[]).map((name, i) => [name, line[i]]))
  );
  return { sheet, header, rows };
}

/** Celda de la fila de detalle `row` (0 = primer pago) en la columna `name`. */
function detailCell(sheet: XLSX.WorkSheet, row: number, name: string) {
  const c = (DETAIL_HEADER as readonly string[]).indexOf(name);
  return sheet[XLSX.utils.encode_cell({ r: row + 1, c })] as XLSX.CellObject | undefined;
}

describe('fetchAllManagerPayments', () => {
  beforeEach(() => mockFetchManagerPayments.mockReset());

  it('recorre todas las páginas de 50 hasta completar el total', async () => {
    mockFetchManagerPayments
      .mockResolvedValueOnce({ rows: Array.from({ length: 50 }, () => payment()), summary: summary(60) })
      .mockResolvedValueOnce({ rows: Array.from({ length: 10 }, () => payment()), summary: summary(60) });

    const result = await fetchAllManagerPayments('manager-1', filters);

    expect(result.rows).toHaveLength(60);
    expect(result.summary.total_count).toBe(60);
    expect(mockFetchManagerPayments).toHaveBeenCalledTimes(2);
    expect(mockFetchManagerPayments.mock.calls[1]).toEqual([
      'manager-1',
      expect.objectContaining({ page: 2, pageSize: 50, scope: 'performed', dateFrom: '2026-09-01' }),
    ]);
  });

  it('se detiene si una página llega incompleta aunque el total diga otra cosa', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({ rows: [payment()], summary: summary(500) });

    const result = await fetchAllManagerPayments('manager-1', filters);

    expect(result.rows).toHaveLength(1);
    expect(mockFetchManagerPayments).toHaveBeenCalledTimes(1);
  });
});

describe('toExcelDateSerial', () => {
  it('convierte a la hora de pared de Bogotá (UTC−5) sin depender del teléfono', () => {
    const serial = toExcelDateSerial('2026-09-10T15:30:00.000Z');
    const parts = XLSX.SSF.parse_date_code(serial as number);
    expect(parts).toEqual(expect.objectContaining({ y: 2026, m: 9, d: 10, H: 10, M: 30 }));
  });

  it('devuelve null si no hay fecha válida', () => {
    expect(toExcelDateSerial(null)).toBeNull();
    expect(toExcelDateSerial('')).toBeNull();
    expect(toExcelDateSerial('no-es-fecha')).toBeNull();
  });
});

describe('exportAndShareManagerPaymentsExcel', () => {
  const manager = { id: 'manager-1', full_name: 'José Pérez' } as CollectionManager;

  beforeEach(() => {
    mockFetchManagerPayments.mockReset();
    mockFetchPaymentMethods.mockReset();
    jest.mocked(FileSystem.writeAsStringAsync).mockClear();
    jest.mocked(Sharing.shareAsync).mockClear();
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  });

  it('escribe un .xlsx en base64 y lo comparte con el MIME y UTI de Excel', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({ rows: [payment()], summary: summary(1) });

    const result = await exportAndShareManagerPaymentsExcel({ manager, filters });

    expect(result.rowCount).toBe(1);
    expect(result.fileName).toMatch(/^Cobros_Jose_Perez_performed_\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [uri] = jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0];
    expect(uri).toBe(`file:///cache/${result.fileName}`);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: XLSX_MIME_TYPE,
      dialogTitle: result.fileName,
      UTI: XLSX_UTI,
    });
    expect(XLSX_MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(XLSX_UTI).toBe('org.openxmlformats.spreadsheetml.sheet');
    expect(writtenWorkbook().SheetNames).toEqual(['Cobros', 'Resumen']);
  });

  it('la hoja «Cobros» conserva las 14 columnas en orden, con «Método de pago» antes de «Sitio de pago»', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({ rows: [payment()], summary: summary(1) });

    await exportAndShareManagerPaymentsExcel({ manager, filters });

    const { sheet, header, rows } = detailTable(writtenWorkbook());
    expect(header).toEqual([
      'Fecha y hora pago',
      'Código negocio',
      'Cliente',
      'Cuota',
      'Recibo virtual',
      'Recibo físico',
      'Estado recibo',
      'Valor',
      'Saldo pendiente negocio',
      'Método de pago',
      'Sitio de pago',
      'Registrado por',
      'Asignación actual',
      'Tiene soporte',
    ]);
    expect(rows).toHaveLength(1);
    expect(sheet['!cols']).toHaveLength(14);
    expect(sheet['!autofilter']).toEqual({ ref: 'A1:N2' });
  });

  it('guarda montos como números con formato de moneda y la fecha como fecha real de Excel', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({
      rows: [payment({ amount: '50000.5' as unknown as number, remaining_balance: 100_000 })],
      summary: summary(1),
    });

    await exportAndShareManagerPaymentsExcel({ manager, filters });

    const { sheet } = detailTable(writtenWorkbook());
    const value = detailCell(sheet, 0, 'Valor');
    const balance = detailCell(sheet, 0, 'Saldo pendiente negocio');
    expect(value).toEqual(expect.objectContaining({ t: 'n', v: 50_000.5, z: MONEY_FORMAT }));
    expect(balance).toEqual(expect.objectContaining({ t: 'n', v: 100_000, z: MONEY_FORMAT }));

    const date = detailCell(sheet, 0, 'Fecha y hora pago');
    expect(date?.t).toBe('n');
    expect(date?.z).toBe('dd/mm/yyyy hh:mm');
    // 15:00 UTC = 10:00 en Bogotá.
    expect(XLSX.SSF.parse_date_code(date?.v as number)).toEqual(
      expect.objectContaining({ y: 2026, m: 9, d: 10, H: 10, M: 0 })
    );
  });

  it('usa el nombre del método que trae el RPC y deja vacío el de los pagos antiguos', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({
      rows: [
        payment({ payment_method_id: 'm-1', payment_method_name: 'Efectivo', payment_site: 'almacen' }),
        payment({ payment_method_id: null, payment_method_name: null, payment_site: null }),
        payment({ payment_method_name: undefined, payment_method_id: undefined }),
      ],
      summary: summary(3),
    });

    await exportAndShareManagerPaymentsExcel({ manager, filters });

    const { rows } = detailTable(writtenWorkbook());
    expect(rows.map((row) => row['Método de pago'])).toEqual(['Efectivo', '', '']);
    expect(rows.map((row) => row['Sitio de pago'])).toEqual(['Almacén', 'No registrado', 'Aplicación Móvil']);
    expect(rows[0]['Registrado por']).toBe('Gestor');
    // Todos traen nombre o no tienen método: no hace falta el catálogo.
    expect(mockFetchPaymentMethods).not.toHaveBeenCalled();
  });

  it('conserva comas, comillas y el resto de columnas de texto tal cual', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({
      rows: [
        payment({
          customer_name: 'Pérez, "Don" Luis',
          payment_method_id: 'm-2',
          payment_method_name: 'Transferencia, "Nequi"',
          installment_number: null,
          receipt_status: 'anulado',
          receipt_number: 'F-9',
          support_path: 'pagos/1.jpg',
          currently_assigned: false,
        }),
      ],
      summary: summary(1),
    });

    await exportAndShareManagerPaymentsExcel({ manager, filters });

    const [row] = detailTable(writtenWorkbook()).rows;
    expect(row).toEqual(
      expect.objectContaining({
        'Código negocio': expect.stringContaining('12'),
        Cliente: 'Pérez, "Don" Luis',
        Cuota: 'Auto (FIFO)',
        'Recibo virtual': 'RV-1',
        'Recibo físico': 'F-9',
        'Estado recibo': 'Anulado',
        'Método de pago': 'Transferencia, "Nequi"',
        'Asignación actual': 'No',
        'Tiene soporte': 'Sí',
      })
    );
  });

  it('si el RPC trae solo el id, resuelve el nombre con el catálogo de métodos de pago', async () => {
    mockFetchPaymentMethods.mockResolvedValueOnce([
      { id: 'm-1', name: 'Efectivo' },
      { id: 'm-3', name: 'Tarjeta' },
    ]);
    mockFetchManagerPayments.mockResolvedValueOnce({
      rows: [
        payment({ payment_method_id: 'm-3', payment_method_name: null }),
        payment({ payment_method_id: 'm-borrado', payment_method_name: null }),
      ],
      summary: summary(2),
    });

    await exportAndShareManagerPaymentsExcel({ manager, filters });

    const { rows } = detailTable(writtenWorkbook());
    expect(rows.map((row) => row['Método de pago'])).toEqual(['Tarjeta', '']);
    expect(mockFetchPaymentMethods).toHaveBeenCalledTimes(1);
  });

  it('si el catálogo falla, exporta igual con el método vacío', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetchPaymentMethods.mockRejectedValueOnce(new Error('sin red'));
    mockFetchManagerPayments.mockResolvedValueOnce({
      rows: [payment({ payment_method_id: 'm-3', payment_method_name: null })],
      summary: summary(1),
    });

    const result = await exportAndShareManagerPaymentsExcel({ manager, filters });

    expect(result.rowCount).toBe(1);
    expect(detailTable(writtenWorkbook()).rows[0]['Método de pago']).toBe('');
    expect(Sharing.shareAsync).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('la hoja «Resumen» trae filtros con fechas reales y el recaudo como moneda', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({ rows: [payment()], summary: summary(1) });

    await exportAndShareManagerPaymentsExcel({ manager, filters });

    const sheet = writtenWorkbook().Sheets.Resumen;
    const lines = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });
    const byLabel = new Map(lines.map((line, r) => [line[0], r]));
    const valueCell = (label: string) =>
      sheet[XLSX.utils.encode_cell({ r: byLabel.get(label) as number, c: 1 })] as XLSX.CellObject;

    expect(lines[0][0]).toBe('REPORTE DE COBROS POR GESTOR');
    expect(valueCell('Gestor').v).toBe('José Pérez');
    expect(valueCell('Fecha desde')).toEqual(expect.objectContaining({ t: 'n', z: 'dd/mm/yyyy' }));
    expect(XLSX.SSF.parse_date_code(valueCell('Fecha desde').v as number)).toEqual(
      expect.objectContaining({ y: 2026, m: 9, d: 1 })
    );
    expect(valueCell('Fecha hasta').v).toBe('Sin filtro');
    expect(valueCell('Recaudo neto')).toEqual(
      expect.objectContaining({ t: 'n', v: 50_000, z: MONEY_FORMAT })
    );
    expect(valueCell('Último cobro').v).toBe('Sin cobros');
    expect(valueCell('Filas exportadas').v).toBe(1);
  });

  it('sin cobros genera el libro solo con encabezados', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({ rows: [], summary: summary(0) });

    const result = await exportAndShareManagerPaymentsExcel({ manager, filters });

    expect(result.rowCount).toBe(0);
    const { header, rows } = detailTable(writtenWorkbook());
    expect(header).toEqual([...DETAIL_HEADER]);
    expect(rows).toHaveLength(0);
  });

  it('si el dispositivo no puede compartir falla antes de consultar el servidor', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await expect(exportAndShareManagerPaymentsExcel({ manager, filters })).rejects.toThrow(
      'Compartir archivos no está disponible en este dispositivo'
    );
    expect(mockFetchManagerPayments).not.toHaveBeenCalled();
  });
});
