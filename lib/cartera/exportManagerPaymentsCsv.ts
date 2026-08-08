import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import {
  fetchManagerPayments,
  type CollectionManager,
  type ManagerPayment,
} from '@/lib/cartera/carteraService';

const PAGE_SIZE = 50;
const MAX_ROWS = 10_000;

const SCOPE_LABEL = {
  performed: 'Realizados por el gestor',
  portfolio: 'Cartera actualmente asignada',
} as const;

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function receiptStatusLabel(status: ManagerPayment['receipt_status']) {
  return status === 'anulado' ? 'Anulado' : 'Vigente';
}

export async function fetchAllManagerPayments(
  managerId: string,
  filters: {
    scope: 'performed' | 'portfolio';
    negocioId: string;
    dateFrom: string;
    dateTo: string;
    receiptStatus: 'todos' | 'emitido' | 'anulado';
    search: string;
  }
) {
  const allRows: ManagerPayment[] = [];
  let page = 1;
  let summary: Awaited<ReturnType<typeof fetchManagerPayments>>['summary'] | null =
    null;

  while (allRows.length < MAX_ROWS) {
    const result = await fetchManagerPayments(managerId, {
      ...filters,
      page,
      pageSize: PAGE_SIZE,
    });
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

export async function exportAndShareManagerPaymentsCsv(options: {
  manager: CollectionManager;
  filters: {
    scope: 'performed' | 'portfolio';
    negocioId: string;
    dateFrom: string;
    dateTo: string;
    receiptStatus: 'todos' | 'emitido' | 'anulado';
    search: string;
  };
}): Promise<{ fileName: string; rowCount: number }> {
  const { manager, filters } = options;
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir archivos no está disponible en este dispositivo');
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error('No hay acceso al almacenamiento temporal del dispositivo');
  }

  const { summary, rows } = await fetchAllManagerPayments(manager.id, filters);
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const header = [
    'Fecha pago',
    'Código negocio',
    'Cliente',
    'Cuota',
    'Recibo virtual',
    'Recibo físico',
    'Estado recibo',
    'Valor',
    'Saldo pendiente negocio',
    'Registrado por',
    'Asignación actual',
    'Tiene soporte',
  ];

  const detailLines = rows.map((payment) =>
    [
      payment.paid_at,
      formatNegocioCodigo(payment.negocio_numero),
      payment.customer_name,
      payment.installment_number != null
        ? String(payment.installment_number)
        : 'Auto (FIFO)',
      payment.virtual_receipt_number,
      payment.receipt_number || '',
      receiptStatusLabel(payment.receipt_status),
      Number(payment.amount),
      Number(payment.remaining_balance),
      payment.created_by_name,
      payment.currently_assigned ? 'Sí' : 'No',
      payment.support_path ? 'Sí' : 'No',
    ]
      .map(csvEscape)
      .join(',')
  );

  const meta = [
    ['REPORTE DE COBROS POR GESTOR'],
    ['Gestor', manager.full_name],
    ['Alcance', SCOPE_LABEL[filters.scope]],
    ['Fecha desde', filters.dateFrom || 'Sin filtro'],
    ['Fecha hasta', filters.dateTo || 'Sin filtro'],
    [
      'Estado recibo',
      filters.receiptStatus === 'todos'
        ? 'Todos'
        : filters.receiptStatus === 'anulado'
          ? 'Anulados'
          : 'Vigentes',
    ],
    ['Búsqueda', filters.search || '—'],
    ['Generado', generatedAt],
    ['Total registros', Number(summary.total_count || 0)],
    ['Pagos vigentes', Number(summary.valid_count || 0)],
    ['Pagos anulados', Number(summary.voided_count || 0)],
    ['Recaudo neto', Number(summary.total_collected || 0)],
    ['Filas exportadas', rows.length],
    [],
  ]
    .map((line) => line.map(csvEscape).join(','))
    .join('\n');

  const csv = `\uFEFF${meta}\n${header.map(csvEscape).join(',')}\n${detailLines.join('\n')}\n`;

  const safeName = manager.full_name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `Cobros_${safeName || 'gestor'}_${filters.scope}_${dateStamp}.csv`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: fileName,
    UTI: 'public.comma-separated-values-text',
  });

  return { fileName, rowCount: rows.length };
}
