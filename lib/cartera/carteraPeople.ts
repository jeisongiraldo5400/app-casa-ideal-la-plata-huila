/**
 * Las personas de una cuota de cartera.
 *
 * Regla del usuario (2026-09-25, migración 20261206120000): «Vendedor» es el
 * dueño del cliente y «Creado por» es quien registra el negocio.
 *
 * - Vendedor (dueño del cliente) (`customers.seller_id`): siempre.
 * - Creado por (`negocios.created_by`): siempre.
 * - Vendedor registrado en el negocio (`negocios.seller_id`): solo si es otra
 *   persona distinta del dueño del cliente (negocios anteriores a la regla o
 *   cliente reasignado después). Es el vendedor que da acceso a la cartera y
 *   el que filtra «Vendedor registrado en el negocio».
 *
 * Lo usan la tarjeta de cartera y la ficha del negocio, con y sin señal.
 */

export type CarteraPeopleSource = {
  created_by?: string | null;
  created_by_name?: string | null;
  seller_id: string | null;
  seller_name: string | null;
  customer_seller_id?: string | null;
  customer_seller_name: string | null;
};

export type CarteraPersonLine = {
  key: 'customer_seller' | 'registered_by' | 'business_seller';
  label: string;
  value: string;
};

export const SIN_ASIGNAR = 'Sin asignar';
const SIN_REGISTRO = '—';

/** ¿El vendedor guardado en el negocio es otra persona distinta del dueño del cliente? */
export function businessSellerDiffers(row: CarteraPeopleSource): boolean {
  if (!row.seller_id && !row.seller_name) return false;
  // Con ids (el RPC y la descarga los traen) se compara por id; sin ellos, por nombre.
  if (row.customer_seller_id !== undefined && row.seller_id) {
    return row.seller_id !== row.customer_seller_id;
  }
  return (row.seller_name || '') !== (row.customer_seller_name || '');
}

export function carteraPeopleLines(row: CarteraPeopleSource): CarteraPersonLine[] {
  const lines: CarteraPersonLine[] = [
    {
      key: 'customer_seller',
      label: 'Vendedor (dueño del cliente)',
      value: row.customer_seller_name || SIN_ASIGNAR,
    },
    { key: 'registered_by', label: 'Creado por', value: row.created_by_name || SIN_REGISTRO },
  ];
  if (businessSellerDiffers(row)) {
    lines.push({
      key: 'business_seller',
      label: 'Vendedor registrado en el negocio',
      value: row.seller_name || SIN_ASIGNAR,
    });
  }
  return lines;
}
