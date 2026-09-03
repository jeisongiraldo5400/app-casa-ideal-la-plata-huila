import { localDateValue } from '@/lib/localDate';

export type LocalCuota = {
  id: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  lateFeeAmount: number;
  status: string;
};

export type AppliedPago = {
  cuotas: LocalCuota[];
  remainingBalance: number;
  leftover: number;
};

function dueTotal(cuota: LocalCuota) {
  return cuota.amount + (cuota.lateFeeAmount || 0);
}

function saldo(cuota: LocalCuota) {
  return Math.max(dueTotal(cuota) - cuota.paidAmount, 0);
}

export function applyPagoToCuotas(cuotas: LocalCuota[], amount: number): AppliedPago {
  let remaining = Math.max(amount, 0);
  const next = [...cuotas]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .map((cuota) => ({ ...cuota }));

  for (const cuota of next) {
    if (remaining <= 0) break;
    if (cuota.status === 'anulada' || cuota.status === 'pagada') continue;
    const apply = Math.min(remaining, saldo(cuota));
    if (apply <= 0) continue;
    cuota.paidAmount += apply;
    remaining -= apply;
    const open = saldo(cuota);
    cuota.status = open <= 0.009 ? 'pagada' : 'parcial';
  }

  const remainingBalance = next.reduce((sum, cuota) => {
    if (cuota.status === 'anulada') return sum;
    return sum + saldo(cuota);
  }, 0);

  return { cuotas: next, remainingBalance, leftover: remaining };
}

export function filterCarteraCuotas<
  T extends LocalCuota & {
    customerName: string;
    customerIdNumber: string | null;
    municipioId: string | null;
    sellerId?: string | null;
    negocioNumero: number;
  },
>(
  rows: T[],
  params: {
    filter: 'todas' | 'por_vencer' | 'vencidas' | 'mora';
    search: string;
    days: number;
    municipioId: string;
    sellerId?: string;
    today?: string;
  }
) {
  const today = params.today || localDateValue();
  const search = params.search.trim().toLowerCase();
  const horizon = new Date(`${today}T12:00:00`);
  horizon.setDate(horizon.getDate() + params.days);
  const horizonDate = horizon.toISOString().slice(0, 10);

  return rows.filter((row) => {
    if (row.status === 'pagada' || row.status === 'anulada') return false;
    if (params.municipioId && row.municipioId !== params.municipioId) return false;
    if (params.sellerId && (row.sellerId ?? null) !== params.sellerId) return false;
    if (search) {
      const haystack = `${row.customerName} ${row.customerIdNumber || ''} ${row.negocioNumero}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (params.filter === 'mora') return row.status === 'mora' || row.dueDate < today;
    if (params.filter === 'vencidas') return row.dueDate < today;
    if (params.filter === 'por_vencer') return row.dueDate >= today && row.dueDate <= horizonDate;
    return true;
  });
}

export type CarteraLocalSummary = {
  total_balance: number;
  overdue_balance: number;
  collected_month: number;
  collection_compliance: number;
  upcoming_7: number;
  upcoming_15: number;
  upcoming_30: number;
};

export function emptyCarteraDashboard(summary: Partial<CarteraLocalSummary> = {}) {
  return {
    summary: {
      total_balance: 0,
      overdue_balance: 0,
      collected_month: 0,
      collection_compliance: 0,
      upcoming_7: 0,
      upcoming_15: 0,
      upcoming_30: 0,
      ...summary,
    } as Record<string, number | null>,
    aging: [] as { label: string; balance: number; businesses: number; customers: number }[],
    managers: [] as {
      gestor_cobro_id: string;
      manager_name: string;
      assigned_businesses: number;
      overdue_balance: number;
      collected_month: number;
      collection_compliance: number;
    }[],
    municipalities: [] as {
      municipality_id: string | null;
      municipality_name: string;
      active_businesses: number;
      overdue_balance: number;
      collected_month: number;
      overdue_rate: number;
    }[],
    monthly: [] as { month: string; expected: number; collected: number }[],
    alerts: {} as Record<string, number>,
    critical_businesses: [] as {
      id: string;
      numero: number;
      customer_name: string;
      overdue_balance: number;
      overdue_installments: number;
      overdue_days: number;
    }[],
    customer_concentration: [] as { customer_id: string; customer_name: string; balance: number }[],
  };
}

export function summarizeCarteraFromCuotas(
  cuotas: LocalCuota[],
  today = localDateValue()
): CarteraLocalSummary {
  const summary: CarteraLocalSummary = {
    total_balance: 0,
    overdue_balance: 0,
    collected_month: 0,
    collection_compliance: 0,
    upcoming_7: 0,
    upcoming_15: 0,
    upcoming_30: 0,
  };

  for (const cuota of cuotas) {
    if (cuota.status === 'pagada' || cuota.status === 'anulada') continue;
    const open = saldo(cuota);
    summary.total_balance += open;
    if (cuota.status === 'mora' || cuota.dueDate < today) {
      summary.overdue_balance += open;
      continue;
    }
    const due = new Date(`${cuota.dueDate}T12:00:00`);
    const now = new Date(`${today}T12:00:00`);
    const days = Math.round((due.getTime() - now.getTime()) / 86400000);
    if (days <= 7) summary.upcoming_7 += open;
    if (days <= 15) summary.upcoming_15 += open;
    if (days <= 30) summary.upcoming_30 += open;
  }

  return summary;
}

export function searchCustomersLocal<T extends { name: string; idNumber: string | null }>(
  customers: T[],
  term: string,
  limit = 20
): T[] {
  const query = term.trim().toLowerCase();
  if (query.length < 2) return [];
  return customers
    .filter((customer) => {
      const name = customer.name.toLowerCase();
      const idNumber = (customer.idNumber || '').toLowerCase();
      return name.includes(query) || idNumber.includes(query);
    })
    .sort((a, b) => {
      const aExact = (a.idNumber || '').toLowerCase() === query ? 0 : 1;
      const bExact = (b.idNumber || '').toLowerCase() === query ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
