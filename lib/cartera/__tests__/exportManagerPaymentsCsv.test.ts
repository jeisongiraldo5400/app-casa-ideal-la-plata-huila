import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportAndShareManagerPaymentsCsv, fetchAllManagerPayments } from '../exportManagerPaymentsCsv';
import type { CollectionManager, ManagerPayment } from '../carteraService';

const mockFetchManagerPayments = jest.fn();

jest.mock('@/lib/cartera/carteraService', () => ({
  fetchManagerPayments: (...args: unknown[]) => mockFetchManagerPayments(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
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

describe('exportAndShareManagerPaymentsCsv', () => {
  const manager = { id: 'manager-1', full_name: 'José Pérez' } as CollectionManager;

  beforeEach(() => {
    mockFetchManagerPayments.mockReset();
    jest.mocked(FileSystem.writeAsStringAsync).mockClear();
    jest.mocked(Sharing.shareAsync).mockClear();
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  });

  it('escribe el CSV con sitio de pago, escapa comillas y comas y lo comparte', async () => {
    mockFetchManagerPayments.mockResolvedValueOnce({
      rows: [
        payment({ payment_site: 'app_movil', customer_name: 'Pérez, "Don" Luis' }),
        payment({ payment_site: 'almacen', installment_number: null, receipt_status: 'anulado' }),
        payment({ payment_site: null }),
      ],
      summary: summary(3),
    });

    const result = await exportAndShareManagerPaymentsCsv({ manager, filters });

    expect(result.rowCount).toBe(3);
    expect(result.fileName).toMatch(/^Cobros_Jose_Perez_performed_\d{4}-\d{2}-\d{2}\.csv$/);
    const [uri, csv] = jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0];
    expect(uri).toBe(`file:///cache/${result.fileName}`);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Sitio de pago');
    expect(csv).toContain('"Pérez, ""Don"" Luis"');
    expect(csv).toContain('Aplicación Móvil');
    expect(csv).toContain('Almacén');
    expect(csv).toContain('No registrado');
    expect(csv).toContain('Auto (FIFO)');
    expect(csv).toContain('Anulado');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'text/csv' }));
  });

  it('si el dispositivo no puede compartir falla antes de consultar el servidor', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await expect(exportAndShareManagerPaymentsCsv({ manager, filters })).rejects.toThrow(
      'Compartir archivos no está disponible en este dispositivo'
    );
    expect(mockFetchManagerPayments).not.toHaveBeenCalled();
  });
});
