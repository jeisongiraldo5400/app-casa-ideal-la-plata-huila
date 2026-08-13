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
    negocioNumero: number;
  },
>(
  rows: T[],
  params: {
    filter: 'todas' | 'por_vencer' | 'vencidas' | 'mora';
    search: string;
    days: number;
    municipioId: string;
    today?: string;
  }
) {
  const today = params.today || new Date().toISOString().slice(0, 10);
  const search = params.search.trim().toLowerCase();
  const horizon = new Date(`${today}T12:00:00`);
  horizon.setDate(horizon.getDate() + params.days);
  const horizonDate = horizon.toISOString().slice(0, 10);

  return rows.filter((row) => {
    if (row.status === 'pagada' || row.status === 'anulada') return false;
    if (params.municipioId && row.municipioId !== params.municipioId) return false;
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
