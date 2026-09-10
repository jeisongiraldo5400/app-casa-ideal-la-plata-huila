/**
 * Filtrado y paginación en memoria del directorio de clientes local.
 *
 * Reglas puras: el repositorio lee WatermelonDB y delega aquí para poder
 * probar el comportamiento sin base de datos ni red.
 */

export type LocalCustomerRow = {
  id: string;
  name: string;
  idNumber: string | null;
  phone: string | null;
  sellerId: string | null;
};

export type LocalCustomerQuery = {
  /** Cuando viene, solo los clientes de ese vendedor ("Mis clientes"). */
  sellerId?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
};

/** Un término vacío no filtra; con texto busca en nombre y documento. */
export function matchesCustomerQuery(customer: LocalCustomerRow, term: string): boolean {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  const name = customer.name.toLowerCase();
  const idNumber = (customer.idNumber || '').toLowerCase();
  const phone = (customer.phone || '').toLowerCase();
  return name.includes(query) || idNumber.includes(query) || phone.includes(query);
}

/** Documento exacto primero, luego alfabético: mismo orden que la búsqueda online. */
function compareCustomers(a: LocalCustomerRow, b: LocalCustomerRow, query: string): number {
  if (query) {
    const aExact = (a.idNumber || '').toLowerCase() === query ? 0 : 1;
    const bExact = (b.idNumber || '').toLowerCase() === query ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
  }
  return a.name.localeCompare(b.name);
}

export function filterLocalCustomers(
  customers: LocalCustomerRow[],
  params: LocalCustomerQuery
): { items: LocalCustomerRow[]; totalCount: number } {
  const query = (params.search || '').trim().toLowerCase();
  const page = Math.max(params.page || 1, 1);
  const pageSize = Math.max(params.pageSize || 20, 1);

  const matched = customers
    .filter((customer) => {
      if (params.sellerId && customer.sellerId !== params.sellerId) return false;
      return matchesCustomerQuery(customer, query);
    })
    .sort((a, b) => compareCustomers(a, b, query));

  const start = (page - 1) * pageSize;
  return { items: matched.slice(start, start + pageSize), totalCount: matched.length };
}

export function countLocalCustomersBySeller(
  customers: LocalCustomerRow[],
  sellerId: string | null
): number {
  if (!sellerId) return 0;
  return customers.filter((customer) => customer.sellerId === sellerId).length;
}
